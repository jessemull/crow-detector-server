import { FindOptionsWhere, Repository } from 'typeorm';
import { CreateFeedDTO, PatchFeedDTO } from '../dto';
import { FeedEvent } from '../entity/feed-event.entity';
import { ImageProcessingService } from './image-processing.service';
import { InjectRepository } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ListEventsQueryDto } from 'src/common/dto/list-events-query.dto';
import { createdAtFilter } from 'src/common/dto/list-range';
import { ProcessingStatus, FeedEventStatus } from 'src/common/types';
import { isAllowedObjectKey, S3MetadataService } from './s3-metadata.service';
import { createLogger } from 'src/common/logger/logger.config';
import { ConfigService } from '@nestjs/config';

const FEED_INSERT_LOCK = 48291;

const FEED_STATUS_FROM: Partial<Record<FeedEventStatus, FeedEventStatus>> = {
  [FeedEventStatus.FEEDING]: FeedEventStatus.PENDING,
  [FeedEventStatus.FEEDING_COMPLETE]: FeedEventStatus.FEEDING,
  [FeedEventStatus.PHOTO_TAKEN]: FeedEventStatus.FEEDING_COMPLETE,
  [FeedEventStatus.COMPLETE]: FeedEventStatus.PHOTO_TAKEN,
};

@Injectable()
export class FeedEventService {
  private readonly logger = createLogger(FeedEventService.name);

  constructor(
    @InjectRepository(FeedEvent)
    private feedEventRepository: Repository<FeedEvent>,
    private readonly imageProcessingService: ImageProcessingService,
    private readonly s3MetadataService: S3MetadataService,
    private readonly configService: ConfigService,
  ) {}

  async create(
    createFeedDTO: CreateFeedDTO,
    skipCooldown = false,
  ): Promise<FeedEvent> {
    const { imageUrl } = createFeedDTO;

    try {
      const s3Metadata =
        await this.s3MetadataService.extractMetadataFromUrl(imageUrl);
      const originalImageSize = await this.s3MetadataService.getObjectSize(
        s3Metadata.bucket,
        s3Metadata.key,
      );

      let created = false;
      const savedEvent = await this.feedEventRepository.manager.transaction(
        async (manager) => {
          await manager.query('SELECT pg_advisory_xact_lock($1)', [
            FEED_INSERT_LOCK,
          ]);
          const repo = manager.getRepository(FeedEvent);
          const existing = await repo.findOne({ where: { imageUrl } });
          if (existing) {
            return existing;
          }

          if (!skipCooldown) {
            await this.checkCooldownPeriod(repo);
          }

          created = true;
          const event = repo.create({
            imageUrl,
            source: s3Metadata.source,
            processingStatus: ProcessingStatus.PENDING,
            feedEventStatus: FeedEventStatus.PENDING,
            originalImageSize,
          });
          try {
            return await repo.save(event);
          } catch (error) {
            if (!isUniqueViolation(error)) {
              throw error;
            }
            created = false;
            const raced = await repo.findOne({ where: { imageUrl } });
            if (!raced) {
              throw error;
            }
            return raced;
          }
        },
      );

      if (created) {
        void this.processImageAsync(
          savedEvent.id,
          s3Metadata.bucket,
          s3Metadata.key,
        ).catch((error: unknown) => {
          this.logger.error(
            `Async image processing rejected for ${savedEvent.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
      }

      return this.withReadableImages(savedEvent);
    } catch (error) {
      this.logger.error(
        `Failed to create feed event: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  private async checkCooldownPeriod(
    repo: Repository<FeedEvent>,
  ): Promise<void> {
    const lastFeedEvents = await repo.find({
      order: { createdAt: 'DESC' },
      take: 1,
      lock: { mode: 'pessimistic_write' },
    });
    const lastFeedEvent = lastFeedEvents[0];
    if (!lastFeedEvent) {
      return;
    }

    const configured = this.configService.get<number>('feedCooldownHours');
    const cooldownHours = configured ?? 4;
    if (cooldownHours === 0) {
      return;
    }
    const cooldownMs = cooldownHours * 60 * 60 * 1000;
    const timeSinceLastFeed = Date.now() - lastFeedEvent.createdAt.getTime();

    if (timeSinceLastFeed < cooldownMs) {
      const remainingHours = Math.ceil(
        (cooldownMs - timeSinceLastFeed) / (60 * 60 * 1000),
      );
      throw new ConflictException(
        `Feed cooldown active. Please wait ${remainingHours} hour(s) before feeding again.`,
      );
    }
  }

  private async processImageAsync(
    eventId: string,
    bucket: string,
    key: string,
  ): Promise<void> {
    try {
      this.logger.info(`Starting async image processing for event ${eventId}`);

      // Update status to processing...

      const claimed = await this.feedEventRepository.update(
        { id: eventId, processingStatus: ProcessingStatus.PENDING },
        { processingStatus: ProcessingStatus.PROCESSING },
      );
      if (!claimed.affected) {
        this.logger.info(
          `Feed event ${eventId} is no longer pending; skipping image processing`,
        );
        return;
      }

      // Process image...

      const result = await this.imageProcessingService.processImage(
        bucket,
        key,
      );

      // Update with processing results...

      const updateData: Partial<FeedEvent> = {
        processingStatus: ProcessingStatus.COMPLETED,
        isAppropriate: result.contentModeration.isAppropriate,
        moderationLabels: JSON.stringify(result.contentModeration.labels),
        faceDetected: result.faceDetection.faceDetected,
        faceBoundingBox: result.faceDetection.boundingBox
          ? JSON.stringify(result.faceDetection.boundingBox)
          : undefined,
        processingDuration: result.processingDuration,
      };

      // If face detected and image is appropriate, upload cropped image...

      if (
        result.faceDetection.faceDetected &&
        result.contentModeration.isAppropriate &&
        result.croppedImageBuffer
      ) {
        const croppedImageUrl =
          await this.imageProcessingService.uploadProcessedImage(
            bucket,
            key,
            result.croppedImageBuffer,
          );

        updateData.croppedImageUrl = croppedImageUrl;

        // Get processed image size...

        const pathParts = key.split('/');
        const filename = pathParts[pathParts.length - 1];
        const baseName = filename.replace(/\.[^/.]+$/, ''); // Remove file extension
        const processedKey = `processed/${baseName}_cropped.jpg`;

        updateData.processedImageSize =
          await this.s3MetadataService.getObjectSize(bucket, processedKey);
      }

      // Update the feed event...

      await this.feedEventRepository.update(
        { id: eventId, processingStatus: ProcessingStatus.PROCESSING },
        updateData,
      );

      this.logger.info(`Image processing completed for event ${eventId}`);
    } catch (error) {
      this.logger.error(
        `Image processing failed for event ${eventId}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );

      // Update status to failed...

      await this.feedEventRepository.update(
        { id: eventId, processingStatus: ProcessingStatus.PROCESSING },
        {
          processingStatus: ProcessingStatus.FAILED,
          processingError:
            error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  async find(query: ListEventsQueryDto): Promise<FeedEvent[]> {
    const where: FindOptionsWhere<FeedEvent> = {};
    const createdAt = createdAtFilter(query);
    if (createdAt) {
      where.createdAt = createdAt;
    }

    const events = await this.feedEventRepository.find({
      order: { createdAt: 'DESC' },
      take: query.limit,
      where,
    });
    return Promise.all(events.map((event) => this.withReadableImages(event)));
  }

  async findById(id: string): Promise<FeedEvent> {
    const feedEvent = await this.feedEventRepository.findOne({
      where: { id },
      relations: ['detectionEvents'],
    });

    if (!feedEvent) {
      throw new NotFoundException(`Feed event with id ${id} not found!`);
    }

    return this.withReadableImages(feedEvent);
  }

  private async withReadableImages(event: FeedEvent): Promise<FeedEvent> {
    const key = objectKey(event.imageUrl);
    if (key && isAllowedObjectKey(key, 'feed/')) {
      event.imageUrl = await this.s3MetadataService.presignGet(key, 'feed/');
    }
    if (
      event.croppedImageUrl &&
      isAllowedObjectKey(event.croppedImageUrl, 'processed/')
    ) {
      event.croppedImageUrl = await this.s3MetadataService.presignGet(
        event.croppedImageUrl,
        'processed/',
      );
    } else if (event.croppedImageUrl) {
      this.logger.warn(
        `Ignoring cropped image outside processed/ for ${event.id}`,
      );
      event.croppedImageUrl = undefined;
    }
    return event;
  }

  async update(
    id: string,
    patchFeedDTO: PatchFeedDTO,
  ): Promise<FeedEvent | null> {
    const feedEvent = await this.feedEventRepository.findOne({
      where: { id },
    });

    if (!feedEvent) {
      throw new NotFoundException(`Feed event with id ${id} not found!`);
    }

    if (
      patchFeedDTO.croppedImageUrl &&
      !isAllowedObjectKey(patchFeedDTO.croppedImageUrl, 'processed/')
    ) {
      throw new BadRequestException(
        'croppedImageUrl must be a key under processed/',
      );
    }

    const result = await this.feedEventRepository.update(
      { id, processingStatus: feedEvent.processingStatus },
      patchFeedDTO,
    );
    if (!result.affected) {
      throw new ConflictException(
        `Feed event ${id} changed before the update was applied`,
      );
    }

    return this.findById(id);
  }

  async reprocessImage(eventId: string): Promise<void> {
    const feedEvent = await this.findById(eventId);

    // Extract S3 metadata from imageUrl for reprocessing...

    const s3Metadata = await this.s3MetadataService.extractMetadataFromUrl(
      feedEvent.imageUrl,
    );

    // Reset processing status and start over...

    const reset = await this.feedEventRepository.update(
      { id: eventId, processingStatus: ProcessingStatus.FAILED },
      {
        processingStatus: ProcessingStatus.PENDING,
        processingError: undefined,
      },
    );
    if (!reset.affected) {
      throw new ConflictException(
        `Feed event ${eventId} is not failed, so it cannot be reprocessed`,
      );
    }

    void this.processImageAsync(
      eventId,
      s3Metadata.bucket,
      s3Metadata.key,
    ).catch((error: unknown) => {
      this.logger.error(
        `Async reprocess rejected for ${eventId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  async getLatestFeedEventStatus(): Promise<{
    id: string;
    status: string;
    createdAt: Date;
  } | null> {
    const latestFeedEvents = await this.feedEventRepository.find({
      order: { createdAt: 'DESC' },
      select: ['id', 'feedEventStatus', 'createdAt'],
      take: 1,
    });

    const latestFeedEvent = latestFeedEvents[0];
    if (!latestFeedEvent) {
      return null;
    }

    return {
      id: latestFeedEvent.id,
      status: latestFeedEvent.feedEventStatus,
      createdAt: latestFeedEvent.createdAt,
    };
  }

  async updateFeedEventStatus(
    id: string,
    status: string,
    photoUrl?: string,
  ): Promise<FeedEvent> {
    // Verify feed event exists...

    await this.findById(id);

    const updateData: Partial<FeedEvent> = {
      feedEventStatus: status as FeedEventStatus,
    };

    // Update timestamps based on status...

    switch (status) {
      case 'FEEDING':
        updateData.feederTriggeredAt = new Date();
        break;
      case 'FEEDING_COMPLETE':
        updateData.feedingCompletedAt = new Date();
        break;
      case 'PHOTO_TAKEN':
        updateData.photoTakenAt = new Date();
        if (photoUrl) {
          updateData.photoUrl = photoUrl;
        }
        break;
      case 'COMPLETE':
        break;
    }

    const nextStatus = status as FeedEventStatus;
    const fromStatus = FEED_STATUS_FROM[nextStatus];
    if (!fromStatus) {
      throw new ConflictException(
        `Feed event ${id} cannot move to ${status} from its current status`,
      );
    }
    const result = await this.feedEventRepository.update(
      { id, feedEventStatus: fromStatus },
      updateData,
    );
    if (!result.affected) {
      throw new ConflictException(
        `Feed event ${id} cannot move to ${status} from its current status`,
      );
    }

    return this.findById(id);
  }
}

function objectKey(imageUrl: string): string | undefined {
  try {
    const path = new URL(imageUrl).pathname.substring(1);
    return decodeURIComponent(path);
  } catch {
    return undefined;
  }
}

function isUniqueViolation(error: unknown): boolean {
  const candidate = error as { code?: string; driverError?: { code?: string } };
  const code = candidate.driverError?.code ?? candidate.code;
  return code === '23505' || code === 'SQLITE_CONSTRAINT';
}
