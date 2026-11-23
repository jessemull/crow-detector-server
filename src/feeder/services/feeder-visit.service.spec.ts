import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { FeederVisit } from '../entity/feeder-visit.entity';
import { FeederVisitService } from './feeder-visit.service';

describe('FeederVisitService', () => {
  const save = jest.fn((value) => value);
  const create = jest.fn((value) => value);
  const repository = { save, create } as unknown as Repository<FeederVisit>;
  const service = new FeederVisitService(repository);

  it('rejects a visit with no animals', async () => {
    await expect(
      service.create({ videoKey: 'feeder/a.mp4', animalCount: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a key outside the feeder prefix', async () => {
    await expect(
      service.create({ videoKey: 'porch/a.mp4', animalCount: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a feeder key longer than the S3 limit', async () => {
    await expect(
      service.create({
        videoKey: `feeder/${'a'.repeat(1100)}.mp4`,
        animalCount: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
