import { Between, Repository } from 'typeorm';
import { CreateDetectionDTO } from '../dto';
import { DetectionEvent } from '../entity';
import { FeedEvent } from 'src/feed';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PatchDetectionDTO } from '../dto/patch-detection.dto';

@Injectable()
export class DetectionEventService {
  constructor(
    @InjectRepository(DetectionEvent)
    private detectionEventRepository: Repository<DetectionEvent>,
    @InjectRepository(FeedEvent)
    private feedEventRepository: Repository<FeedEvent>
  ) {}

  async create(createDetectionDTO: CreateDetectionDTO): Promise<DetectionEvent> {
    const { feedEvent: feedEventId, imageUrl } = createDetectionDTO;

    const feedEvent = await this.feedEventRepository.findOne({
      where: { id: feedEventId }
    });
    
    if (!feedEvent) {
      throw new NotFoundException(`Feed event with id ${feedEventId} not found!`);
    }

    const event = await this.detectionEventRepository.create({
      feedEvent,
      imageUrl
    });

    return this.detectionEventRepository.save(event);
  }

  async find(limit?: number, from?: string, to?: string) {
    const where: any = {};

    if  (from && to) {
      where.createdAt = Between(new Date(from), new  Date(to));
    } else if (from) {
      where.createdAt = Between(new Date(from), new Date());
    }

    return this.detectionEventRepository.find({
      order: { createdAt: 'DESC' },
      take: limit,
      where,
    })
  }

  async findById(id: string): Promise<DetectionEvent | null> {
    return this.detectionEventRepository.findOne({
      where: { id },
      relations: ['feedEvent'],
    })
  }

  async update(patchDetectionDTO: PatchDetectionDTO): Promise<DetectionEvent | null> {
    const { confidence, crowCount, id,  } = patchDetectionDTO;

    const detectionEvent = await this.detectionEventRepository.findOne({
      where: { id }
    })

    if (!detectionEvent) {
      throw new NotFoundException(`Detection event with id ${id} not found!`);
    }

    await this.detectionEventRepository.update(id, {
      confidence,
      crowCount
    });

    return this.findById(id);
  }
}