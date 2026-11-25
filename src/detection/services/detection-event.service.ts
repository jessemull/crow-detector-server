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
import { S3MetadataService } from 'src/feed/services/s3-metadata.service';
import { createLogger } from 'src/common/logger/logger.config';
import { ProcessingStatus } from 'src/common/types';

@Injectable()
export class DetectionEventService {
  private readonly logger = createLogger(DetectionEventService.name);

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
    const { imageUrl } = createDetectionDTO;

    const existing = await this.detectionEventRepository.findOne({
      where: { imageUrl },
      relations: ['feedEvent'],
    });
    if (existing) {
      if (
        existing.processingStatus === ProcessingStatus.FAILED ||
        existing.processingStatus === ProcessingStatus.PENDING
      ) {
        const metadata =
          await this.s3MetadataService.extractMetadataFromUrl(imageUrl);
        this.assertDetectionKey(metadata.type);
        if (existing.processingStatus === ProcessingStatus.FAILED) {
          await this.detectionEventRepository.update(
            { id: existing.id, processingStatus: ProcessingStatus.FAILED },
            { processingStatus: ProcessingStatus.PENDING, processingError: '' },
          );
        }
        this.startProcessing(existing.id, metadata.bucket, metadata.key);
      }
      return existing;
    }

    const metadata =
      await this.s3MetadataService.extractMetadataFromUrl(imageUrl);
    this.assertDetectionKey(metadata.type);
    const feedEvent = metadata.feedEventId
      ? await this.feedEventRepository.findOne({
          where: { id: metadata.feedEventId },
        })
      : null;

    const event = this.detectionEventRepository.create({
      imageUrl,
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
        where: { imageUrl },
        relations: ['feedEvent'],
      });
      if (!raced) {
        throw error;
      }
      return raced;
    }

    this.startProcessing(savedEvent.id, metadata.bucket, metadata.key);

    return savedEvent;
  }

  async find(query: ListEventsQueryDto): Promise<DetectionEvent[]> {
    const where: FindOptionsWhere<DetectionEvent> = {};
    const createdAt = createdAtFilter(query);
    if (createdAt) {
      where.createdAt = createdAt;
    }

    return this.detectionEventRepository.find({
      order: { createdAt: 'DESC' },
      take: query.limit,
      where,
      relations: ['feedEvent'],
    });
  }

  async findById(id: string): Promise<DetectionEvent> {
    const event = await this.detectionEventRepository.findOne({
      where: { id },
      relations: ['feedEvent'],
    });

    if (!event) {
      throw new NotFoundException(`Detection event with id ${id} not found!`);
    }

    return event;
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
        if (removed.affected) {
          this.logger.info(
            `No animals detected, deleted detection event ${eventId}`,
          );
        }
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

  private startProcessing(eventId: string, bucket: string, key: string): void {
    this.processImageAsync(eventId, bucket, key).catch((error: unknown) => {
      this.logger.error(
        `Image processing failed for detection event ${eventId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }
}

function isUniqueViolation(error: unknown): boolean {
  const candidate = error as { code?: string; driverError?: { code?: string } };
  const code = candidate.driverError?.code ?? candidate.code;
  return code === '23505' || code === 'SQLITE_CONSTRAINT';
}
