import { Between, FindOptionsWhere, Repository } from 'typeorm';
import { CreateDetectionDTO } from '../dto/create-detection.dto';
import { DetectionEvent } from '../entity/detection-event.entity';
import { DetectionImageProcessingService } from './detection-image-processing.service';
import { FeedEvent } from 'src/feed/entity/feed-event.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ListEventsQueryDto } from 'src/common/dto/list-events-query.dto';
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
      return existing;
    }

    const metadata =
      await this.s3MetadataService.extractMetadataFromUrl(imageUrl);
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

    const savedEvent = await this.detectionEventRepository.save(event);

    this.processImageAsync(savedEvent.id, metadata.bucket, metadata.key).catch(
      (error: unknown) => {
        this.logger.error(
          `Image processing failed for detection event ${savedEvent.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      },
    );

    return savedEvent;
  }

  async find(query: ListEventsQueryDto): Promise<DetectionEvent[]> {
    const where: FindOptionsWhere<DetectionEvent> = {};

    if (query.from && query.to) {
      where.createdAt = Between(new Date(query.from), new Date(query.to));
    } else if (query.from) {
      where.createdAt = Between(new Date(query.from), new Date());
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
      throw new NotFoundException(
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
        processingStatus: ProcessingStatus.COMPLETED,
        processingDuration: result.processingDuration,
        originalImageSize,
        detectedAnimals: result.detectedAnimals,
      };

      if (result.hasAnimals) {
        // If animals detected, store the detection data...

        updateData.crowCount = result.crowCount;
        updateData.animalCount = result.animalCount;
      } else {
        // If no animals detected, delete the detection event...

        await this.detectionEventRepository.delete({
          id: eventId,
          processingStatus: ProcessingStatus.PROCESSING,
        });
        this.logger.info(
          `No animals detected, deleted detection event ${eventId}`,
        );
        return;
      }

      // Update the detection event...

      await this.detectionEventRepository.update(
        { id: eventId, processingStatus: ProcessingStatus.PROCESSING },
        updateData,
      );
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
}
