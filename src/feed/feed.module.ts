import { FeedController } from './feed.controller';
import { FeedEvent } from './entity/feed-event.entity';
import {
  Module,
  MiddlewareConsumer,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeedEventService } from './services/feed-event.service';
import { EcdsaAuthMiddleware } from 'src/auth/middleware/ecdsa-auth.middleware';

@Module({
  controllers: [FeedController],
  exports: [FeedEventService],
  imports: [TypeOrmModule.forFeature([FeedEvent])],
  providers: [FeedEventService],
})
export class FeedModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(EcdsaAuthMiddleware)
      .forRoutes(
        { path: 'feed', method: RequestMethod.POST },
        { path: 'feed', method: RequestMethod.PATCH },
      );
  }
}
