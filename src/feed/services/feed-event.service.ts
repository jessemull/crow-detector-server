import { Between, Repository } from 'typeorm';
import { CreateFeedDTO } from '../dto/create-feed.dto';
import { FeedEvent } from '../entity/feed-event.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PatchFeedDTO } from '../dto/patch-feed.dto';

@Injectable()
export class FeedEventService {
  constructor(
    @InjectRepository(FeedEvent)
    private feedEventRepository: Repository<FeedEvent>,
  ) {}

  async create(createFeedDTO: CreateFeedDTO): Promise<FeedEvent> {
    const { imageUrl, source } = createFeedDTO;

    const event = this.feedEventRepository.create({
      imageUrl,
      source,
    });

    return this.feedEventRepository.save(event);
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
    const { id, confidence, croppedImageUrl, status } = patchFeedDTO;

    const feedEvent = await this.feedEventRepository.findOne({
      where: { id },
    });

    if (!feedEvent) {
      throw new NotFoundException(`Feed event with id ${id} not found!`);
    }

    await this.feedEventRepository.update(id, {
      confidence,
      croppedImageUrl,
      status,
    });

    return this.findById(id);
  }
}
