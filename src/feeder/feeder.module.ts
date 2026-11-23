import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DetectionModule } from '../detection/detection.module';
import { InMemoryRateLimitGuard } from '../porch/guards/in-memory-rate-limit.guard';
import { DispenseRequest } from './entity/dispense-request.entity';
import { FeederVisit } from './entity/feeder-visit.entity';
import { FeederController } from './feeder.controller';
import { FeederHostController } from './feeder-host.controller';
import { DispenseRequestService } from './services/dispense-request.service';
import { FeederPlaybackService } from './services/feeder-playback.service';
import { FeederVisitService } from './services/feeder-visit.service';

@Module({
  imports: [
    DetectionModule,
    TypeOrmModule.forFeature([DispenseRequest, FeederVisit]),
  ],
  controllers: [FeederHostController, FeederController],
  providers: [
    DispenseRequestService,
    FeederVisitService,
    FeederPlaybackService,
    InMemoryRateLimitGuard,
  ],
})
export class FeederModule {}
