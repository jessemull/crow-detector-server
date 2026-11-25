import {
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, MoreThan, Repository } from 'typeorm';
import { createLogger } from 'src/common/logger/logger.config';
import {
  DispenseRequest,
  DispenseStatus,
} from '../entity/dispense-request.entity';

/** Public button spacing. Independent of the old 4-hour image-feed cooldown. */
export const DISPENSE_COOLDOWN_MS = 10 * 60 * 1000;

/** A proof is about 12s plus the upload. Older recording rows were abandoned. */
export const STUCK_RECORDING_MS = 5 * 60 * 1000;

/** S3 object keys are limited to 1024 bytes. */
export const FEEDER_OBJECT_KEY_MAX_LENGTH = 1024;

export function assertFeederMp4Key(key: string, message: string): void {
  if (
    key.length > FEEDER_OBJECT_KEY_MAX_LENGTH ||
    !key.startsWith('feeder/') ||
    !key.endsWith('.mp4') ||
    key.includes('..')
  ) {
    throw new BadRequestException(message);
  }
}

@Injectable()
export class DispenseRequestService {
  private readonly logger = createLogger(DispenseRequestService.name);

  constructor(
    @InjectRepository(DispenseRequest)
    private readonly dispenseRepository: Repository<DispenseRequest>,
  ) {}

  async create(): Promise<DispenseRequest> {
    try {
      return await this.dispenseRepository.manager.transaction(
        async (manager) => {
          // Two inserts can both pass a prior SELECT under READ COMMITTED.

          await manager.query(
            `SELECT pg_advisory_xact_lock(hashtext('dispense_cooldown'))`,
          );
          const cutoff = new Date(Date.now() - DISPENSE_COOLDOWN_MS);
          const recent = await manager.findOne(DispenseRequest, {
            where: { createdAt: MoreThan(cutoff) },
            order: { createdAt: 'DESC' },
          });
          if (recent) {
            throw new BadRequestException(
              'Feed cooldown active. Try again in a few minutes.',
            );
          }

          const request = manager.create(DispenseRequest, {
            status: DispenseStatus.REQUESTED,
          });
          return manager.save(request);
        },
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(
        `Dispense cooldown check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ServiceUnavailableException('Unable to check feed cooldown');
    }
  }

  async findById(id: string): Promise<DispenseRequest> {
    const request = await this.dispenseRepository.findOne({ where: { id } });
    if (!request) {
      throw new NotFoundException('Dispense request not found');
    }
    return request;
  }

  async claimNext(): Promise<DispenseRequest | null> {
    return this.dispenseRepository.manager.transaction(async (manager) => {
      const requested = await this.claimStatus(
        manager,
        DispenseStatus.REQUESTED,
      );
      if (requested) {
        return requested;
      }

      const staleBefore = new Date(Date.now() - STUCK_RECORDING_MS);
      return this.claimStatus(manager, DispenseStatus.RECORDING, staleBefore);
    });
  }

  async complete(
    id: string,
    status: DispenseStatus.READY | DispenseStatus.FAILED,
    proofKey?: string,
  ): Promise<DispenseRequest> {
    if (status === DispenseStatus.READY) {
      if (!proofKey) {
        throw new BadRequestException('A feeder proof key is required');
      }
      assertFeederMp4Key(proofKey, 'Proof key must be a feeder mp4');
    }

    const updated = await this.dispenseRepository.update(
      { id, status: DispenseStatus.RECORDING },
      {
        status,
        updatedAt: new Date(),
        ...(status === DispenseStatus.READY ? { proofKey } : {}),
      },
    );
    if (!updated.affected) {
      await this.findById(id);
      throw new BadRequestException('Dispense request is not recording');
    }
    return this.findById(id);
  }

  private async claimStatus(
    manager: EntityManager,
    status: DispenseStatus.REQUESTED | DispenseStatus.RECORDING,
    updatedBefore?: Date,
  ): Promise<DispenseRequest | null> {
    const query = manager
      .createQueryBuilder(DispenseRequest, 'request')
      .setLock('pessimistic_partial_write')
      .where('request.status = :status', { status })
      .orderBy('request.createdAt', 'ASC');
    if (updatedBefore) {
      query.andWhere('request.updatedAt < :updatedBefore', { updatedBefore });
    }

    const next = await query.getOne();
    if (!next) {
      return null;
    }

    // The lock skips rows another host holds. The status predicate makes the
    // write itself a no-op if this row was claimed before the lock landed.

    const updated = await manager.update(
      DispenseRequest,
      { id: next.id, status },
      { status: DispenseStatus.RECORDING, updatedAt: new Date() },
    );
    if (!updated.affected) {
      return null;
    }

    next.status = DispenseStatus.RECORDING;
    return next;
  }
}
