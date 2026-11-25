import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CreateDetectionDTO } from './dto/create-detection.dto';
import { DetectionEventService } from './services/detection-event.service';
import { DetectionEvent } from './entity/detection-event.entity';
import { DetectionResponse } from 'src/common/types';
import { ListEventsQueryDto } from 'src/common/dto/list-events-query.dto';
import { EcdsaAuthGuard } from '../auth/middleware/ecdsa-auth.guard';
import { PatchDetectionDTO } from './dto/patch-detection.dto';

@Controller('detection')
export class DetectionController {
  constructor(private readonly detectionEventService: DetectionEventService) {}

  @Post()
  @UseGuards(EcdsaAuthGuard)
  async crowDetectedEvent(
    @Body() createDetectionDTO: CreateDetectionDTO,
  ): Promise<DetectionResponse> {
    const event = await this.detectionEventService.create(createDetectionDTO);
    return {
      data: event,
      message: 'Detection event created successfully!',
    };
  }

  @Get()
  @UseGuards(EcdsaAuthGuard)
  async getDetectionEvents(
    @Query() query: ListEventsQueryDto,
  ): Promise<DetectionEvent[]> {
    return this.detectionEventService.find(query);
  }

  @Get(':id')
  @UseGuards(EcdsaAuthGuard)
  async getDetectionEventById(
    @Param('id') id: string,
  ): Promise<DetectionResponse> {
    const event = await this.detectionEventService.findById(id);
    return {
      data: event,
      message: 'Detection event retrieved successfully!',
    };
  }

  @Patch(':id')
  @UseGuards(EcdsaAuthGuard)
  async updateCrowDetectedEvent(
    @Param('id') id: string,
    @Body() patchDetectionDTO: PatchDetectionDTO,
  ): Promise<DetectionResponse> {
    const event = await this.detectionEventService.update(
      id,
      patchDetectionDTO,
    );
    return {
      data: event,
      message: 'Detection event updated successfully!',
    };
  }
}
