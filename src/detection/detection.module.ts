import { DetectionController } from './detection.controller';
import { DetectionEvent } from './entity';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  controllers: [DetectionController],
  exports: [DetectionEventService],
  imports: [TypeOrmModule.forFeature([DetectionEvent])],
  providers: [DetectionEventService],
})

export class DetectionModule {}