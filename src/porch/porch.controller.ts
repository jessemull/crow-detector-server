import { Controller, Get, UseGuards } from '@nestjs/common';
import { InMemoryRateLimitGuard } from './guards/in-memory-rate-limit.guard';
import {
  PorchClipListItem,
  PorchClipsService,
} from './services/porch-clips.service';

@Controller('porch')
export class PorchController {
  constructor(private readonly porchClipsService: PorchClipsService) {}

  @Get('clips')
  @UseGuards(InMemoryRateLimitGuard)
  async listClips(): Promise<PorchClipListItem[]> {
    return this.porchClipsService.listClips();
  }
}
