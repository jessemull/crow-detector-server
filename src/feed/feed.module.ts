import { FeedController } from './feed.controller';
import { FeedEvent } from './entity';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  controllers: [FeedController],
  exports: [FeedEventService],
  imports: [TypeOrmModule.forFeature([FeedEvent])],
  providers: [FeedEventService],
})

export class FeedModule {}