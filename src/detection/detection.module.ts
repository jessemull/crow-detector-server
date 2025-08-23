import { DetectionController } from './detection.controller';
import { DetectionEvent } from './entity/detection-event.entity';
import { DetectionEventService } from './services/detection-event.service';
import { DetectionImageProcessingService } from './services/detection-image-processing.service';
import { FeedEvent } from 'src/feed';
import { Module } from '@nestjs/common';
import { S3MetadataService } from 'src/feed/services/s3-metadata.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClaudeService } from './services/claude.service';

@Module({
  controllers: [DetectionController],
  exports: [DetectionEventService],
  imports: [TypeOrmModule.forFeature([DetectionEvent, FeedEvent])],
  providers: [
    DetectionEventService,
    DetectionImageProcessingService,
    S3MetadataService,
    ClaudeService,
  ],
})
export class DetectionModule {}
