import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UrlsController } from './urls.controller';
import { UrlsService } from './services/urls.service';
import { FeedEvent } from '../feed/entity/feed-event.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FeedEvent])],
  controllers: [UrlsController],
  providers: [UrlsService],
  exports: [UrlsService],
})
export class UrlsModule {}
