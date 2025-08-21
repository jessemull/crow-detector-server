import { EcdsaAuthMiddleware } from '../auth/middleware/ecdsa-auth.middleware';
import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { UrlsController } from './urls.controller';
import { UrlsService } from './services/urls.service';

@Module({
  controllers: [UrlsController],
  providers: [UrlsService],
  exports: [UrlsService],
})
export class UrlsModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(EcdsaAuthMiddleware)
      .forRoutes(
        { path: 'urls/feed', method: RequestMethod.POST },
        { path: 'urls/detection', method: RequestMethod.POST },
      );
  }
}
