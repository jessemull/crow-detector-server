import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { Repository } from 'typeorm';
import {
  DispenseRequest,
  DispenseStatus,
} from '../entity/dispense-request.entity';
import { DispenseRequestService } from './dispense-request.service';

describe('DispenseRequestService', () => {
  const findOne = jest.fn();
  const create = jest.fn((_entity, value) => value);
  const save = jest.fn((value) => ({ id: 'req-1', ...value }));
  const query = jest.fn();
  const update = jest.fn();
  const rows: Array<DispenseRequest | null> = [];
  const queryBuilder = {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getOne: jest.fn(() => Promise.resolve(rows.shift() ?? null)),
  };
  type DispenseManager = {
    query: typeof query;
    findOne: typeof findOne;
    create: typeof create;
    save: typeof save;
    update: typeof update;
    createQueryBuilder: () => typeof queryBuilder;
    transaction: (
      work: (value: DispenseManager) => Promise<unknown>,
    ) => Promise<unknown>;
  };
  const manager: DispenseManager = {
    query,
    findOne,
    create,
    save,
    update,
    createQueryBuilder: jest.fn(() => queryBuilder),
    transaction: (work) => work(manager),
  };
  const repositoryUpdate = jest.fn();
  const repository = {
    findOne,
    save,
    update: repositoryUpdate,
    manager,
  } as unknown as Repository<DispenseRequest>;

  const service = new DispenseRequestService(repository);

  beforeEach(() => {
    jest.clearAllMocks();
    rows.length = 0;
    queryBuilder.setLock.mockReturnThis();
    queryBuilder.where.mockReturnThis();
    queryBuilder.andWhere.mockReturnThis();
    queryBuilder.orderBy.mockReturnThis();
  });

  it('rejects a second request inside the cooldown', async () => {
    findOne.mockResolvedValue({ id: 'recent', createdAt: new Date() });
    await expect(service.create()).rejects.toBeInstanceOf(ConflictException);
    expect(save).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledWith(
      "SELECT pg_advisory_xact_lock(hashtext('dispense_cooldown'))",
    );
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

  it('claims a requested row only while that status still matches', async () => {
    rows.push({
      id: 'req-1',
      status: DispenseStatus.REQUESTED,
    } as DispenseRequest);
    update.mockResolvedValue({ affected: 1 });

    const result = await service.claimNext();

    expect(result?.status).toBe(DispenseStatus.RECORDING);
    expect(queryBuilder.setLock).toHaveBeenCalledWith(
      'pessimistic_partial_write',
    );
    expect(update).toHaveBeenCalledWith(
      DispenseRequest,
      { id: 'req-1', status: DispenseStatus.REQUESTED },
      expect.objectContaining({ status: DispenseStatus.RECORDING }),
    );
  });

  it('does not claim a row that another host already took', async () => {
    rows.push(
      { id: 'req-1', status: DispenseStatus.REQUESTED } as DispenseRequest,
      null,
    );
    update.mockResolvedValue({ affected: 0 });

    await expect(service.claimNext()).resolves.toBeNull();
  });

  it('reclaims a recording row left behind by a crashed host', async () => {
    rows.push(null, {
      id: 'stuck',
      status: DispenseStatus.RECORDING,
    } as DispenseRequest);
    update.mockResolvedValue({ affected: 1 });

    const result = await service.claimNext();

    expect(result?.id).toBe('stuck');
    expect(queryBuilder.andWhere).toHaveBeenCalled();
  });

  it('returns null when nothing is waiting', async () => {
    rows.push(null, null);
    await expect(service.claimNext()).resolves.toBeNull();
    expect(update).not.toHaveBeenCalled();
  });

  it('completes a recording proof', async () => {
    repositoryUpdate.mockResolvedValue({ affected: 1 });
    findOne.mockResolvedValue({
      id: 'req-1',
      status: DispenseStatus.READY,
      proofKey: 'feeder/proof.mp4',
    });

    const result = await service.complete(
      'req-1',
      DispenseStatus.READY,
      'feeder/proof.mp4',
    );

    expect(result.status).toBe(DispenseStatus.READY);
    expect(result.proofKey).toBe('feeder/proof.mp4');
    expect(repositoryUpdate).toHaveBeenCalledWith(
      { id: 'req-1', status: DispenseStatus.RECORDING },
      expect.objectContaining({
        status: DispenseStatus.READY,
        proofKey: 'feeder/proof.mp4',
      }),
    );
  });

  it('marks a recording dispense failed without a proof key', async () => {
    repositoryUpdate.mockResolvedValue({ affected: 1 });
    findOne.mockResolvedValue({
      id: 'req-1',
      status: DispenseStatus.FAILED,
    });

    const result = await service.complete('req-1', DispenseStatus.FAILED);

    expect(result.status).toBe(DispenseStatus.FAILED);
    expect(repositoryUpdate).toHaveBeenCalledWith(
      { id: 'req-1', status: DispenseStatus.RECORDING },
      expect.objectContaining({ status: DispenseStatus.FAILED }),
    );
  });

  it('rejects completion before the row is claimed', async () => {
    repositoryUpdate.mockResolvedValue({ affected: 0 });
    findOne.mockResolvedValue({
      id: 'req-1',
      status: DispenseStatus.REQUESTED,
    });

    await expect(
      service.complete('req-1', DispenseStatus.READY, 'feeder/proof.mp4'),
    ).rejects.toThrow('Dispense request is not recording');
    expect(save).not.toHaveBeenCalled();
  });

  it('rejects a ready proof that has no key', async () => {
    await expect(
      service.complete('req-1', DispenseStatus.READY),
    ).rejects.toThrow('A feeder proof key is required');
    expect(repositoryUpdate).not.toHaveBeenCalled();
  });

  it('rejects a missing dispense when completing', async () => {
    repositoryUpdate.mockResolvedValue({ affected: 0 });
    findOne.mockResolvedValue(null);

    await expect(
      service.complete('missing', DispenseStatus.FAILED),
    ).rejects.toThrow('Dispense request not found');
  });

  it('rejects a proof key that is not a bounded feeder mp4', async () => {
    await expect(
      service.complete(
        'req-1',
        DispenseStatus.READY,
        `feeder/${'a'.repeat(1100)}.mp4`,
      ),
    ).rejects.toThrow('Proof key must be a feeder mp4');
    expect(repositoryUpdate).not.toHaveBeenCalled();
  });

  it('rejects a proof key that escapes the feeder prefix', async () => {
    await expect(
      service.complete(
        'req-1',
        DispenseStatus.READY,
        'feeder/../secrets/not-a-clip.mp4',
      ),
    ).rejects.toThrow('Proof key must be a feeder mp4');
    expect(repositoryUpdate).not.toHaveBeenCalled();
  });
});
