import { Body, Controller, Get, Patch, Post, Query } from '@nestjs/common';
import { CreateDetectionDTO } from './dto/create-detection.dto';
import { DetectionEvent } from '.';
import { DetectionEventService } from './services';
import { DetectionResponse } from 'src/common/types';
import { PatchDetectionDTO } from './dto/patch-detection.dto';

@Controller('detection')
export class DetectionController {
  constructor(private readonly detectionEventService: DetectionEventService) {}

  @Post()
  async crowDetectedEvent(@Body() createDetectionDTO: CreateDetectionDTO): Promise<DetectionResponse> {
    const event = await this.detectionEventService.create(createDetectionDTO);
    return {
      data: event,
      message: 'Detection event created successfully!',
    }
  }

  @Get()
  async getDetectionEvents(@Query('limit') limit: number, @Query('from') from: string, @Query('to') to: string): Promise<DetectionEvent[]> {
    return this.detectionEventService.find(limit, from, to);
  }

  @Patch()
  async updateCrowDetectedEvent(@Body() patchDetectionDTO: PatchDetectionDTO): Promise<DetectionResponse> {
    const event = await this.detectionEventService.update(patchDetectionDTO);
    return {
      data: event,
      message: 'Detection event updated successfully!',
    };
  }
}

