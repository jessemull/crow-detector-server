import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InMemoryRateLimitGuard } from '../porch/guards/in-memory-rate-limit.guard';
import { DispenseStatus } from './entity/dispense-request.entity';
import { DispenseRequestService } from './services/dispense-request.service';
import { FeederPlaybackService } from './services/feeder-playback.service';
import { FeederVisitService } from './services/feeder-visit.service';

@Controller('feeder')
export class FeederController {
  constructor(
    private readonly dispenseRequestService: DispenseRequestService,
    private readonly feederVisitService: FeederVisitService,
    private readonly feederPlaybackService: FeederPlaybackService,
  ) {}

  @Post('dispense')
  @UseGuards(InMemoryRateLimitGuard)
  async requestDispense() {
    const request = await this.dispenseRequestService.create();
    return {
      id: request.id,
      status: request.status,
    };
  }

  @Get('dispense/:id')
  @UseGuards(InMemoryRateLimitGuard)
  async getDispense(@Param('id', ParseUUIDPipe) id: string) {
    const request = await this.dispenseRequestService.findById(id);
    if (request.status === DispenseStatus.READY && request.proofKey) {
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

  @Get('clips')
  @UseGuards(InMemoryRateLimitGuard)
  async listClips() {
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
