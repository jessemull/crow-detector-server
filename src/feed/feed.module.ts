import { FeedController } from './feed.controller';
import { FeedEvent } from './entity/feed-event.entity';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeedEventService } from './services/feed-event.service';

@Module({
  controllers: [FeedController],
  exports: [FeedEventService],
  imports: [TypeOrmModule.forFeature([FeedEvent])],
  providers: [FeedEventService],
})
export class FeedModule {}
