import { Between, Repository } from 'typeorm';
import { CreateDetectionDTO } from '../dto/create-detection.dto';
import { DetectionEvent } from '../entity/detection-event.entity';
import { DetectionImageProcessingService } from './detection-image-processing.service';
import { FeedEvent } from 'src/feed/entity/feed-event.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PatchDetectionDTO } from '../dto/patch-detection.dto';
import { S3MetadataService } from 'src/feed/services/s3-metadata.service';
import { createLogger } from 'src/common/logger/logger.config';

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

    const event = this.detectionEventRepository.create({
      imageUrl,
      processingStatus: 'PENDING',
    });

    const savedEvent = await this.detectionEventRepository.save(event);

    // Start async image processing...

    this.processImageAsync(savedEvent.id, imageUrl).catch((error) => {
      console.error(
        `Image processing failed for detection event ${savedEvent.id}:`,
        error,
      );
    });

    return savedEvent;
  }

  async find(
    limit?: number,
    from?: string,
    to?: string,
  ): Promise<DetectionEvent[]> {
    const where: Record<string, any> = {};

    if (from && to) {
      where.createdAt = Between(new Date(from), new Date(to));
    } else if (from) {
      where.createdAt = Between(new Date(from), new Date());
    }

    return this.detectionEventRepository.find({
      order: { createdAt: 'DESC' },
      take: limit,
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

    await this.detectionEventRepository.update(id, patchDetectionDTO);

    return this.findById(id);
  }

  private async processImageAsync(
    eventId: string,
    imageUrl: string,
  ): Promise<void> {
    try {
      // Update status to processing...

      await this.detectionEventRepository.update(eventId, {
        processingStatus: 'PROCESSING',
      });

      // Extract S3 bucket and key from URL...

      const metadata =
        await this.s3MetadataService.extractMetadataFromUrl(imageUrl);
      const { bucket, key } = metadata;

      // Process the image for animal detection...

      const result = await this.detectionImageProcessingService.processImage(
        bucket,
        key,
      );

      // Get original image size...

      const originalImageSize = await this.s3MetadataService.getObjectSize(
        bucket,
        key,
      );

      // Update with processing results...

      const updateData: Partial<DetectionEvent> = {
        processingStatus: 'COMPLETED',
        processingDuration: result.processingDuration,
        originalImageSize,
        detectedAnimals: JSON.stringify(result.detectedAnimals),
      };

      if (result.hasAnimals) {
        // If animals detected, store the detection data...

        updateData.confidence = result.confidence;
        updateData.crowCount = result.crowCount;
        updateData.animalCount = result.animalCount;
      } else {
        // If no animals detected, delete the detection event...

        await this.detectionEventRepository.delete(eventId);
        this.logger.info(
          `No animals detected, deleted detection event ${eventId}`,
        );
        return;
      }

      // Update the detection event...

      await this.detectionEventRepository.update(eventId, updateData);
      this.logger.info(`Animal detection completed for event ${eventId}`);
    } catch (error: unknown) {
      await this.detectionEventRepository.update(eventId, {
        processingStatus: 'FAILED',
        processingError: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
