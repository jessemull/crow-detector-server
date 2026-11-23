import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import {
  DispenseRequest,
  DispenseStatus,
} from '../entity/dispense-request.entity';
import { DispenseRequestService } from './dispense-request.service';

describe('DispenseRequestService', () => {
  const findOne = jest.fn();
  const create = jest.fn((value) => value);
  const save = jest.fn((value) => ({ id: 'req-1', ...value }));
  const repository = {
    findOne,
    create,
    save,
  } as unknown as Repository<DispenseRequest>;

  const service = new DispenseRequestService(repository);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects a second request inside the cooldown', async () => {
    findOne.mockResolvedValue({ id: 'recent', createdAt: new Date() });
    await expect(service.create()).rejects.toBeInstanceOf(BadRequestException);
    expect(save).not.toHaveBeenCalled();
  });

  it('fails closed when the cooldown query throws', async () => {
    findOne.mockRejectedValue(new Error('db down'));
    await expect(service.create()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(save).not.toHaveBeenCalled();
  });

  it('stores a requested dispense when the cooldown is clear', async () => {
    findOne.mockResolvedValue(null);
    const result = await service.create();
    expect(result.status).toBe(DispenseStatus.REQUESTED);
    expect(save).toHaveBeenCalled();
  });
});
