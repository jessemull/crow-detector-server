import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DetectedAnimal } from 'src/common/types';
import { FeederVisit } from '../entity/feeder-visit.entity';

export const MAX_FEEDER_VISITS = 50;

export type CreateFeederVisitInput = {
  videoKey: string;
  animalCount: number;
  crowCount?: number;
  detectedAnimals?: DetectedAnimal[];
  dispenseRequestId?: string;
};

@Injectable()
export class FeederVisitService {
  constructor(
    @InjectRepository(FeederVisit)
    private readonly visitRepository: Repository<FeederVisit>,
  ) {}

  async create(input: CreateFeederVisitInput): Promise<FeederVisit> {
    if (
      !input.videoKey.startsWith('feeder/') ||
      !input.videoKey.endsWith('.mp4')
    ) {
      throw new BadRequestException('Visit video must be a feeder mp4 key');
    }
    if (!Number.isInteger(input.animalCount) || input.animalCount < 1) {
      throw new BadRequestException('A visit requires at least one animal');
    }

    const visit = this.visitRepository.create({
      videoKey: input.videoKey,
      animalCount: input.animalCount,
      crowCount: input.crowCount ?? 0,
      detectedAnimals: input.detectedAnimals,
      dispenseRequestId: input.dispenseRequestId,
    });
    return this.visitRepository.save(visit);
  }

  async listNewest(): Promise<FeederVisit[]> {
    return this.visitRepository.find({
      order: { createdAt: 'DESC' },
      take: MAX_FEEDER_VISITS,
    });
  }
}
