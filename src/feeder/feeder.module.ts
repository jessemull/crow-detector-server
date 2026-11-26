import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DetectionModule } from '../detection/detection.module';
import { PorchModule } from '../porch/porch.module';
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
    PorchModule,
    TypeOrmModule.forFeature([DispenseRequest, FeederVisit]),
  ],
  controllers: [FeederHostController, FeederController],
  providers: [
    DispenseRequestService,
    FeederVisitService,
    FeederPlaybackService,
  ],
})
export class FeederModule {}
