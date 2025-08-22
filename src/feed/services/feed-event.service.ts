import { Between, Repository } from 'typeorm';
import { CreateFeedDTO, PatchFeedDTO } from '../dto';
import { FeedEvent } from '../entity/feed-event.entity';
import { ImageProcessingService } from './image-processing.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { S3MetadataService } from './s3-metadata.service';
import { ProcessingStatus } from 'src/common/types';

@Injectable()
export class FeedEventService {
  private readonly logger = new Logger(FeedEventService.name);

  constructor(
    @InjectRepository(FeedEvent)
    private feedEventRepository: Repository<FeedEvent>,
    private readonly imageProcessingService: ImageProcessingService,
    private readonly s3MetadataService: S3MetadataService,
  ) {}

  async create(createFeedDTO: CreateFeedDTO): Promise<FeedEvent> {
    const { imageUrl } = createFeedDTO;

    try {
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
        s3Bucket: s3Metadata.bucket,
        s3Key: s3Metadata.key,
        processingStatus: ProcessingStatus.PENDING,
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

  private async processImageAsync(
    eventId: string,
    bucket: string,
    key: string,
  ): Promise<void> {
    try {
      this.logger.log(`Starting async image processing for event ${eventId}`);

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

        const processedKey = key.replace('.jpg', '_cropped.jpg');
        updateData.processedImageSize =
          await this.s3MetadataService.getObjectSize(bucket, processedKey);
      }

      // Update the feed event...

      await this.feedEventRepository.update(eventId, updateData);

      this.logger.log(`Image processing completed for event ${eventId}`);
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

  async findById(id: string): Promise<FeedEvent | null> {
    return this.feedEventRepository.findOne({
      where: { id },
      relations: ['detectionEvents'],
    });
  }

  async update(patchFeedDTO: PatchFeedDTO): Promise<FeedEvent | null> {
    const { id, ...updateData } = patchFeedDTO;

    const feedEvent = await this.feedEventRepository.findOne({
      where: { id },
    });

    if (!feedEvent) {
      throw new NotFoundException(`Feed event with id ${id} not found!`);
    }

    // Allow updating any field for dev/debugging purposes
    await this.feedEventRepository.update(id, updateData);

    return this.findById(id);
  }

  async reprocessImage(eventId: string): Promise<void> {
    const feedEvent = await this.findById(eventId);
    if (!feedEvent) {
      throw new NotFoundException(`Feed event with id ${eventId} not found!`);
    }

    if (!feedEvent.s3Bucket || !feedEvent.s3Key) {
      throw new Error('Feed event does not have S3 metadata for reprocessing');
    }

    // Reset processing status and start over...

    await this.feedEventRepository.update(eventId, {
      processingStatus: ProcessingStatus.PENDING,
      processingError: undefined,
    });

    // Start async processing again...

    void this.processImageAsync(eventId, feedEvent.s3Bucket, feedEvent.s3Key);
  }
}
