import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { createLogger } from 'src/common/logger/logger.config';
import {
  DispenseRequest,
  DispenseStatus,
} from '../entity/dispense-request.entity';

/** Public button spacing. Independent of the old 4-hour image-feed cooldown. */
export const DISPENSE_COOLDOWN_MS = 10 * 60 * 1000;

@Injectable()
export class DispenseRequestService {
  private readonly logger = createLogger(DispenseRequestService.name);

  constructor(
    @InjectRepository(DispenseRequest)
    private readonly dispenseRepository: Repository<DispenseRequest>,
  ) {}

  async create(): Promise<DispenseRequest> {
    const cutoff = new Date(Date.now() - DISPENSE_COOLDOWN_MS);
    let recent: DispenseRequest | null;
    try {
      recent = await this.dispenseRepository.findOne({
        where: { createdAt: MoreThan(cutoff) },
        order: { createdAt: 'DESC' },
      });
    } catch (error) {
      this.logger.error(
        `Dispense cooldown check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ServiceUnavailableException('Unable to check feed cooldown');
    }

    if (recent) {
      throw new BadRequestException(
        'Feed cooldown active. Try again in a few minutes.',
      );
    }

    const request = this.dispenseRepository.create({
      status: DispenseStatus.REQUESTED,
    });
    return this.dispenseRepository.save(request);
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
      const next = await manager.findOne(DispenseRequest, {
        where: { status: DispenseStatus.REQUESTED },
        order: { createdAt: 'ASC' },
      });
      if (!next) {
        return null;
      }
      next.status = DispenseStatus.RECORDING;
      return manager.save(next);
    });
  }

  async complete(
    id: string,
    status: DispenseStatus.READY | DispenseStatus.FAILED,
    proofKey?: string,
  ): Promise<DispenseRequest> {
    const request = await this.findById(id);
    if (
      request.status !== DispenseStatus.RECORDING &&
      request.status !== DispenseStatus.REQUESTED
    ) {
      throw new BadRequestException('Dispense request is already finished');
    }

    if (status === DispenseStatus.READY) {
      if (
        !proofKey ||
        !proofKey.startsWith('feeder/') ||
        !proofKey.endsWith('.mp4')
      ) {
        throw new BadRequestException('A feeder proof key is required');
      }
      request.proofKey = proofKey;
    }

    request.status = status;
    return this.dispenseRepository.save(request);
  }
}
