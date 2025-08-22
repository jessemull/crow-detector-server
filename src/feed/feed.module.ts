import { FeedController } from './feed.controller';
import { FeedEvent } from './entity/feed-event.entity';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeedEventService } from './services/feed-event.service';
import { ImageProcessingService } from './services/image-processing.service';
import { S3MetadataService } from './services/s3-metadata.service';

@Module({
  controllers: [FeedController],
  exports: [FeedEventService],
  imports: [TypeOrmModule.forFeature([FeedEvent])],
  providers: [FeedEventService, ImageProcessingService, S3MetadataService],
})
export class FeedModule {}
