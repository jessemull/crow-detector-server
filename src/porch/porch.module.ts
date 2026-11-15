import { Module } from '@nestjs/common';
import { PorchController } from './porch.controller';
import { InMemoryRateLimitGuard } from './guards/in-memory-rate-limit.guard';
import { PorchClipsService } from './services/porch-clips.service';

@Module({
  controllers: [PorchController],
  providers: [PorchClipsService, InMemoryRateLimitGuard],
})
export class PorchModule {}
