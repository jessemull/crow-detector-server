import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InMemoryRateLimitGuard } from '../porch/guards/in-memory-rate-limit.guard';
import { DispenseStatus } from './entity/dispense-request.entity';
import {
  cooldownEndsAtFrom,
  DispenseRequestService,
  FeederPublicStatus,
} from './services/dispense-request.service';
import {
  FeederFeedsResponse,
  FeederFeedsService,
} from './services/feeder-feeds.service';
import { FeederPlaybackService } from './services/feeder-playback.service';
import {
  FeederVisitService,
  feederClipStillStored,
} from './services/feeder-visit.service';

@Controller('feeder')
export class FeederController {
  constructor(
    private readonly dispenseRequestService: DispenseRequestService,
    private readonly feederVisitService: FeederVisitService,
    private readonly feederPlaybackService: FeederPlaybackService,
    private readonly feederFeedsService: FeederFeedsService,
  ) {}

  @Get('status')
  @UseGuards(InMemoryRateLimitGuard)
  async getStatus(): Promise<FeederPublicStatus> {
    return this.dispenseRequestService.getPublicStatus();
  }

  @Post('dispense')
  @HttpCode(201)
  @UseGuards(InMemoryRateLimitGuard)
  async requestDispense(): Promise<{
    id: string;
    status: DispenseStatus;
    cooldownEndsAt: string;
  }> {
    const request = await this.dispenseRequestService.create();
    return {
      id: request.id,
      status: request.status,
      cooldownEndsAt: cooldownEndsAtFrom(request.createdAt).toISOString(),
    };
  }

  @Get('dispense/:id')
  @UseGuards(InMemoryRateLimitGuard)
  async getDispense(@Param('id', ParseUUIDPipe) id: string): Promise<{
    id: string;
    status: DispenseStatus;
    proofClipUrl?: string;
    expiresAt?: string;
  }> {
    const request = await this.dispenseRequestService.findById(id);
    if (
      request.status === DispenseStatus.READY &&
      request.proofKey &&
      feederClipStillStored(request.createdAt)
    ) {
      const playback = await this.feederPlaybackService.signPlayback(
        request.proofKey,
      );
      return {
        id: request.id,
        status: request.status,
        proofClipUrl: playback.playbackUrl,
        expiresAt: playback.expiresAt,
      };
    }
    return { id: request.id, status: request.status };
  }

  @Get('feeds')
  @UseGuards(InMemoryRateLimitGuard)
  async listFeeds(): Promise<FeederFeedsResponse> {
    return this.feederFeedsService.listFeeds();
  }

  @Get('clips')
  @UseGuards(InMemoryRateLimitGuard)
  async listClips(): Promise<
    Array<{
      id: string;
      recordedAt: string;
      animalCount: number;
      crowCount: number;
      playbackUrl: string;
      expiresAt: string;
    }>
  > {
    const visits = await this.feederVisitService.listNewest();
    return Promise.all(
      visits.map(async (visit) => {
        const playback = await this.feederPlaybackService.signPlayback(
          visit.videoKey,
        );
        return {
          id: visit.id,
          recordedAt: visit.createdAt.toISOString(),
          animalCount: visit.animalCount,
          crowCount: visit.crowCount,
          playbackUrl: playback.playbackUrl,
          expiresAt: playback.expiresAt,
        };
      }),
    );
  }
}
