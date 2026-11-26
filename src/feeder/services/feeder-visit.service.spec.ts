import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { FeederVisit } from '../entity/feeder-visit.entity';
import { FeederVisitService } from './feeder-visit.service';

describe('FeederVisitService', () => {
  const save = jest.fn((value) => value);
  const create = jest.fn((value) => value);
  const find = jest.fn();
  const repository = {
    save,
    create,
    find,
  } as unknown as Repository<FeederVisit>;
  const service = new FeederVisitService(repository);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('stores a visit that names an animal', async () => {
    const result = await service.create({
      videoKey: 'feeder/a.mp4',
      animalCount: 1,
    });

    expect(save).toHaveBeenCalled();
    expect(result.videoKey).toBe('feeder/a.mp4');
  });

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

  it('rejects a key that walks out of the feeder prefix', async () => {
    await expect(
      service.create({ videoKey: 'feeder/../secret.mp4', animalCount: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(save).not.toHaveBeenCalled();
  });

  it('rejects a feeder key longer than the S3 limit', async () => {
    await expect(
      service.create({
        videoKey: `feeder/${'a'.repeat(1100)}.mp4`,
        animalCount: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lists newest visits still inside the clip retention window', async () => {
    find.mockResolvedValue([]);

    await service.listNewest();

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        order: { createdAt: 'DESC' },
        take: 50,
      }),
    );
    const createdAt = find.mock.calls[0][0].where.createdAt;
    expect(createdAt.type ?? createdAt._type).toBe('moreThan');
  });
});
