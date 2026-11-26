import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { DetectedAnimal } from 'src/common/types';
import { FeederVisit } from '../entity/feeder-visit.entity';
import { assertFeederMp4Key } from './dispense-request.service';

export const MAX_FEEDER_VISITS = 50;

/** Matches the feeder/ object lifecycle in the S3 template. */
export const FEEDER_CLIP_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export function feederClipStillStored(
  createdAt: Date,
  now = Date.now(),
): boolean {
  return now - createdAt.getTime() < FEEDER_CLIP_RETENTION_MS;
}

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
    assertFeederMp4Key(input.videoKey, 'Visit video must be a feeder mp4 key');
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
    const cutoff = new Date(Date.now() - FEEDER_CLIP_RETENTION_MS);
    return this.visitRepository.find({
      where: { createdAt: MoreThan(cutoff) },
      order: { createdAt: 'DESC' },
      take: MAX_FEEDER_VISITS,
    });
  }
}
