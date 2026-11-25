import { FindOptionsWhere, Repository } from 'typeorm';
import { CreateDetectionDTO } from '../dto/create-detection.dto';
import { DetectionEvent } from '../entity/detection-event.entity';
import { DetectionImageProcessingService } from './detection-image-processing.service';
import { FeedEvent } from 'src/feed/entity/feed-event.entity';
import { InjectRepository } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ListEventsQueryDto } from 'src/common/dto/list-events-query.dto';
import { createdAtFilter } from 'src/common/dto/list-range';
import { PatchDetectionDTO } from '../dto/patch-detection.dto';
import {
  isAllowedObjectKey,
  S3MetadataService,
} from 'src/feed/services/s3-metadata.service';
import { createLogger } from 'src/common/logger/logger.config';
import { ProcessingStatus } from 'src/common/types';

const MAX_IN_FLIGHT = 4;

@Injectable()
export class DetectionEventService {
  private readonly logger = createLogger(DetectionEventService.name);
  private inFlight = 0;

  constructor(
    @InjectRepository(DetectionEvent)
    private detectionEventRepository: Repository<DetectionEvent>,
    @InjectRepository(FeedEvent)
    private feedEventRepository: Repository<FeedEvent>,
    private readonly detectionImageProcessingService: DetectionImageProcessingService,
    private readonly s3MetadataService: S3MetadataService,
  ) {}

  async create(
    createDetectionDTO: CreateDetectionDTO,
  ): Promise<DetectionEvent> {
    const metadata = await this.s3MetadataService.extractMetadataFromUrl(
      createDetectionDTO.imageUrl,
    );
    this.assertDetectionKey(metadata.type);
    const canonical = canonicalObjectUrl(metadata.bucket, metadata.key);

    const existing = await this.detectionEventRepository.findOne({
      where: [
        { imageUrl: canonical },
        { imageUrl: createDetectionDTO.imageUrl },
      ],
      relations: ['feedEvent'],
    });
    if (existing) {
      const resumed = await this.resumeIfNeeded(
        existing,
        metadata.bucket,
        metadata.key,
      );
      return this.withReadableImages(resumed);
    }

    const feedEvent = metadata.feedEventId
      ? await this.feedEventRepository.findOne({
          where: { id: metadata.feedEventId },
        })
      : null;

    const event = this.detectionEventRepository.create({
      imageUrl: canonical,
      processingStatus: ProcessingStatus.PENDING,
      ...(feedEvent ? { feedEvent } : {}),
    });

    let savedEvent: DetectionEvent;
    try {
      savedEvent = await this.detectionEventRepository.save(event);
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      const raced = await this.detectionEventRepository.findOne({
        where: [
          { imageUrl: canonical },
          { imageUrl: createDetectionDTO.imageUrl },
        ],
        relations: ['feedEvent'],
      });
      if (!raced) {
        throw error;
      }
      const resumed = await this.resumeIfNeeded(
        raced,
        metadata.bucket,
        metadata.key,
      );
      return this.withReadableImages(resumed);
    }

    this.startProcessing(savedEvent.id, metadata.bucket, metadata.key);

    return this.withReadableImages(savedEvent);
  }

  async find(query: ListEventsQueryDto): Promise<DetectionEvent[]> {
    const where: FindOptionsWhere<DetectionEvent> = {};
    const createdAt = createdAtFilter(query);
    if (createdAt) {
      where.createdAt = createdAt;
    }

    const events = await this.detectionEventRepository.find({
      order: { createdAt: 'DESC' },
      take: query.limit,
      where,
      relations: ['feedEvent'],
    });
    return Promise.all(events.map((event) => this.withReadableImages(event)));
  }

  async findById(id: string): Promise<DetectionEvent> {
    const event = await this.detectionEventRepository.findOne({
      where: { id },
      relations: ['feedEvent'],
    });

    if (!event) {
      throw new NotFoundException(`Detection event with id ${id} not found!`);
    }

    return this.withReadableImages(event);
  }

  async update(
    id: string,
    patchDetectionDTO: PatchDetectionDTO,
  ): Promise<DetectionEvent> {
    const detectionEvent = await this.detectionEventRepository.findOne({
      where: { id },
    });

    if (!detectionEvent) {
      throw new NotFoundException(`Detection event with id ${id} not found!`);
    }

    const result = await this.detectionEventRepository.update(
      { id, processingStatus: detectionEvent.processingStatus },
      patchDetectionDTO,
    );
    if (!result.affected) {
      throw new ConflictException(
        `Detection event ${id} changed before the update was applied`,
      );
    }

    return this.findById(id);
  }

  private async processImageAsync(
    eventId: string,
    bucket: string,
    key: string,
  ): Promise<void> {
    try {
      const claimed = await this.detectionEventRepository.update(
        { id: eventId, processingStatus: ProcessingStatus.PENDING },
        { processingStatus: ProcessingStatus.PROCESSING },
      );
      if (!claimed.affected) {
        this.logger.info(
          `Detection event ${eventId} is no longer pending; skipping`,
        );
        return;
      }

      // Process the image for animal detection...

      const originalImageSize = await this.s3MetadataService.getObjectSize(
        bucket,
        key,
      );
      const result = await this.detectionImageProcessingService.processImage(
        bucket,
        key,
      );

      if (!result.hasAnimals) {
        const removed = await this.detectionEventRepository.delete({
          id: eventId,
          processingStatus: ProcessingStatus.PROCESSING,
        });
        if (!removed.affected) {
          this.logger.warn(
            `Detection event ${eventId} changed before the empty result was removed`,
          );
          return;
        }
        await this.detectionImageProcessingService.deleteStoredImage(
          bucket,
          key,
        );
        this.logger.info(
          `No animals detected, deleted detection event ${eventId}`,
        );
        return;
      }

      const completed = await this.detectionEventRepository.update(
        { id: eventId, processingStatus: ProcessingStatus.PROCESSING },
        {
          processingStatus: ProcessingStatus.COMPLETED,
          processingDuration: result.processingDuration,
          originalImageSize,
          detectedAnimals: result.detectedAnimals,
          crowCount: result.crowCount,
          animalCount: result.animalCount,
        },
      );
      if (!completed.affected) {
        this.logger.warn(
          `Detection event ${eventId} changed before animal counts were stored`,
        );
        return;
      }
      this.logger.info(`Animal detection completed for event ${eventId}`);
    } catch (error: unknown) {
      await this.detectionEventRepository.update(
        { id: eventId, processingStatus: ProcessingStatus.PROCESSING },
        {
          processingStatus: ProcessingStatus.FAILED,
          processingError:
            error instanceof Error ? error.message : String(error),
        },
      );
      throw error;
    }
  }

  private assertDetectionKey(type: string): void {
    if (type !== 'detection') {
      throw new BadRequestException(
        'Detection image key must be under detection/',
      );
    }
  }

  private async resumeIfNeeded(
    event: DetectionEvent,
    bucket: string,
    key: string,
  ): Promise<DetectionEvent> {
    const status = event.processingStatus;
    if (
      status !== ProcessingStatus.FAILED &&
      status !== ProcessingStatus.PENDING &&
      status !== ProcessingStatus.PROCESSING
    ) {
      return event;
    }
    if (status !== ProcessingStatus.PENDING) {
      const reset = await this.detectionEventRepository.update(
        { id: event.id, processingStatus: status },
        { processingStatus: ProcessingStatus.PENDING, processingError: '' },
      );
      if (!reset.affected) {
        const current = await this.detectionEventRepository.findOne({
          where: { id: event.id },
          relations: ['feedEvent'],
        });
        return current ?? event;
      }
    }
    this.startProcessing(event.id, bucket, key);
    const refreshed = await this.detectionEventRepository.findOne({
      where: { id: event.id },
      relations: ['feedEvent'],
    });
    return refreshed ?? event;
  }

  private async withReadableImages(
    event: DetectionEvent,
  ): Promise<DetectionEvent> {
    const key = objectKey(event.imageUrl);
    if (key && isAllowedObjectKey(key, 'detection/')) {
      event.imageUrl = await this.s3MetadataService.presignGet(
        key,
        'detection/',
      );
    }
    if (event.feedEvent) {
      const feedKey = objectKey(event.feedEvent.imageUrl);
      if (feedKey && isAllowedObjectKey(feedKey, 'feed/')) {
        event.feedEvent.imageUrl = await this.s3MetadataService.presignGet(
          feedKey,
          'feed/',
        );
      }
      if (
        event.feedEvent.croppedImageUrl &&
        isAllowedObjectKey(event.feedEvent.croppedImageUrl, 'processed/')
      ) {
        event.feedEvent.croppedImageUrl =
          await this.s3MetadataService.presignGet(
            event.feedEvent.croppedImageUrl,
            'processed/',
          );
      }
    }
    return event;
  }

  private startProcessing(eventId: string, bucket: string, key: string): void {
    if (this.inFlight >= MAX_IN_FLIGHT) {
      this.logger.warn(
        `Detection event ${eventId} stays pending because ${MAX_IN_FLIGHT} image jobs are already running`,
      );
      return;
    }
    this.inFlight += 1;
    this.processImageAsync(eventId, bucket, key)
      .catch((error: unknown) => {
        this.logger.error(
          `Image processing failed for detection event ${eventId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      })
      .finally(() => {
        this.inFlight -= 1;
      });
  }
}

function canonicalObjectUrl(bucket: string, key: string): string {
  const encoded = key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `https://${bucket}.s3.amazonaws.com/${encoded}`;
}

function objectKey(imageUrl: string): string | undefined {
  try {
    return decodeURIComponent(new URL(imageUrl).pathname.substring(1));
  } catch {
    return undefined;
  }
}

function isUniqueViolation(error: unknown): boolean {
  const candidate = error as { code?: string; driverError?: { code?: string } };
  const code = candidate.driverError?.code ?? candidate.code;
  return code === '23505' || code === 'SQLITE_CONSTRAINT';
}
