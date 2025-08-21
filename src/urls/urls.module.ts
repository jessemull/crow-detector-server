import { Module } from '@nestjs/common';
import { UrlsController } from './urls.controller';
import { UrlsService } from './services/urls.service';

@Module({
  controllers: [UrlsController],
  providers: [UrlsService],
  exports: [UrlsService],
})
export class UrlsModule {}
