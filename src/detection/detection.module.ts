import { FeedEvent } from 'src/feed';
import { DetectionController } from './detection.controller';
import { DetectionEvent } from './entity/detection-event.entity';
import { DetectionEventService } from './services/detection-event.service';
import {
  Module,
  MiddlewareConsumer,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EcdsaAuthMiddleware } from 'src/auth/middleware/ecdsa-auth.middleware';

@Module({
  controllers: [DetectionController],
  exports: [DetectionEventService],
  imports: [TypeOrmModule.forFeature([DetectionEvent, FeedEvent])],
  providers: [DetectionEventService],
})
export class DetectionModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(EcdsaAuthMiddleware)
      .forRoutes(
        { path: 'detection', method: RequestMethod.POST },
        { path: 'detection', method: RequestMethod.PATCH },
      );
  }
}
