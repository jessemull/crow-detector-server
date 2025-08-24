import { Between, Repository } from 'typeorm';
import { CreateFeedDTO, PatchFeedDTO } from '../dto';
import { FeedEvent } from '../entity/feed-event.entity';
import { ImageProcessingService } from './image-processing.service';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ProcessingStatus, FeedEventStatus } from 'src/common/types';
import { S3MetadataService } from './s3-metadata.service';
import { createLogger } from 'src/common/logger/logger.config';
import { ConfigService } from '@nestjs/config';

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
      // Check cooldown period if not skipped...

      if (!skipCooldown) {
        await this.checkCooldownPeriod();
      }

      // Extract metadata from S3 URL...

      const s3Metadata =
        await this.s3MetadataService.extractMetadataFromUrl(imageUrl);

      // Get object size...

      const originalImageSize = await this.s3MetadataService.getObjectSize(
        s3Metadata.bucket,
        s3Metadata.key,
      );

      // Create feed event with extracted metadata...

      const event = this.feedEventRepository.create({
        imageUrl,
        source: s3Metadata.source, // Use extracted source from S3
        processingStatus: ProcessingStatus.PENDING,
        feedEventStatus: FeedEventStatus.PENDING, // Initial feeder status
        originalImageSize,
        createdAt: new Date(s3Metadata.timestamp), // Use S3 timestamp
      });

      const savedEvent = await this.feedEventRepository.save(event);

      // Start async image processing...

      void this.processImageAsync(
        savedEvent.id,
        s3Metadata.bucket,
        s3Metadata.key,
      );

      return savedEvent;
    } catch (error) {
      this.logger.error(
        `Failed to create feed event: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  private async checkCooldownPeriod(): Promise<void> {
    try {
      // Get the most recent feed event...

      const lastFeedEvents = await this.feedEventRepository.find({
        order: { createdAt: 'DESC' },
        take: 1,
      });

      const lastFeedEvent = lastFeedEvents[0];

      if (!lastFeedEvent) {
        // No previous feed events, cooldown not applicable...

        return;
      }

      // Get cooldown period from configuration (default 4 hours)...

      const cooldownHours =
        this.configService.get<number>('FEED_COOLDOWN_HOURS') || 4;
      const cooldownMs = cooldownHours * 60 * 60 * 1000;

      // Calculate time since last feed...

      const timeSinceLastFeed = Date.now() - lastFeedEvent.createdAt.getTime();

      if (timeSinceLastFeed < cooldownMs) {
        const remainingHours = Math.ceil(
          (cooldownMs - timeSinceLastFeed) / (60 * 60 * 1000),
        );
        throw new BadRequestException(
          `Feed cooldown active. Please wait ${remainingHours} hour(s) before feeding again.`,
        );
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(
        `Error checking cooldown period: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );

      // If there's an error checking cooldown, allow the feed to proceed...

      this.logger.warn('Cooldown check failed, allowing feed to proceed');
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

      await this.feedEventRepository.update(eventId, {
        processingStatus: ProcessingStatus.PROCESSING,
      });

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

      await this.feedEventRepository.update(eventId, updateData);

      this.logger.info(`Image processing completed for event ${eventId}`);
    } catch (error) {
      this.logger.error(
        `Image processing failed for event ${eventId}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );

      // Update status to failed...

      await this.feedEventRepository.update(eventId, {
        processingStatus: ProcessingStatus.FAILED,
        processingError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async find(limit?: number, from?: string, to?: string): Promise<FeedEvent[]> {
    const where: Record<string, any> = {};

    if (from && to) {
      where.createdAt = Between(new Date(from), new Date(to));
    } else if (from) {
      where.createdAt = Between(new Date(from), new Date());
    }

    return this.feedEventRepository.find({
      order: { createdAt: 'DESC' },
      take: limit,
      where,
    });
  }

  async findById(id: string): Promise<FeedEvent> {
    const feedEvent = await this.feedEventRepository.findOne({
      where: { id },
      relations: ['detectionEvents'],
    });

    if (!feedEvent) {
      throw new NotFoundException(`Feed event with id ${id} not found!`);
    }

    return feedEvent;
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

    // Allow updating any field for dev/debugging purposes...

    await this.feedEventRepository.update(id, patchFeedDTO);

    return this.findById(id);
  }

  async reprocessImage(eventId: string): Promise<void> {
    const feedEvent = await this.findById(eventId);

    // Extract S3 metadata from imageUrl for reprocessing...

    const s3Metadata = await this.s3MetadataService.extractMetadataFromUrl(
      feedEvent.imageUrl,
    );

    // Reset processing status and start over...

    await this.feedEventRepository.update(eventId, {
      processingStatus: ProcessingStatus.PENDING,
      processingError: undefined,
    });

    // Start async processing again...

    void this.processImageAsync(eventId, s3Metadata.bucket, s3Metadata.key);
  }

  // Feeder status management methods
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
    await this.findById(id); // Verify feed event exists

    const updateData: Partial<FeedEvent> = {
      feedEventStatus: status as FeedEventStatus, // Type assertion for enum
    };

    // Update timestamps based on status
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
        // All timestamps already set
        break;
    }

    await this.feedEventRepository.update(id, updateData);

    return this.findById(id);
  }
}
