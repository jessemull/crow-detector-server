import { DetectionController } from './detection.controller';
import { DetectionEvent } from './entity/detection-event.entity';
import { DetectionEventService } from './services/detection-event.service';
import { DetectionImageProcessingService } from './services/detection-image-processing.service';
import { FeedEvent } from 'src/feed';
import { FeedModule } from 'src/feed/feed.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClaudeService } from './services/claude.service';

@Module({
  controllers: [DetectionController],
  exports: [DetectionEventService],
  imports: [FeedModule, TypeOrmModule.forFeature([DetectionEvent, FeedEvent])],
  providers: [
    DetectionEventService,
    DetectionImageProcessingService,
    ClaudeService,
  ],
})
export class DetectionModule {}
