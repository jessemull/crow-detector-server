import { Between, Repository } from 'typeorm';
import { CreateDetectionDTO } from '../dto/create-detection.dto';
import { DetectionEvent } from '../entity/detection-event.entity';
import { FeedEvent } from 'src/feed/entity/feed-event.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PatchDetectionDTO } from '../dto/patch-detection.dto';

@Injectable()
export class DetectionEventService {
  constructor(
    @InjectRepository(DetectionEvent)
    private detectionEventRepository: Repository<DetectionEvent>,
    @InjectRepository(FeedEvent)
    private feedEventRepository: Repository<FeedEvent>,
  ) {}

  async create(
    createDetectionDTO: CreateDetectionDTO,
  ): Promise<DetectionEvent> {
    const { feedEvent: feedEventId, imageUrl } = createDetectionDTO;

    const feedEvent = await this.feedEventRepository.findOne({
      where: { id: feedEventId },
    });

    if (!feedEvent) {
      throw new NotFoundException(
        `Feed event with id ${feedEventId} not found!`,
      );
    }

    const event = this.detectionEventRepository.create({
      feedEvent,
      imageUrl,
    });

    return this.detectionEventRepository.save(event);
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

  async findById(id: string): Promise<DetectionEvent | null> {
    return this.detectionEventRepository.findOne({
      where: { id },
      relations: ['feedEvent'],
    });
  }

  async update(
    patchDetectionDTO: PatchDetectionDTO,
  ): Promise<DetectionEvent | null> {
    const { confidence, crowCount, id } = patchDetectionDTO;

    const detectionEvent = await this.detectionEventRepository.findOne({
      where: { id },
    });

    if (!detectionEvent) {
      throw new NotFoundException(`Detection event with id ${id} not found!`);
    }

    await this.detectionEventRepository.update(id, {
      confidence,
      crowCount,
    });

    return this.findById(id);
  }
}
