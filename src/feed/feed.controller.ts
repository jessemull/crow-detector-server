import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CreateFeedDTO } from './dto/create-feed.dto';
import { FeedEvent } from './entity/feed-event.entity';
import { FeedEventService } from './services/feed-event.service';
import { FeedResponse } from 'src/common/types';
import { PatchFeedDTO } from './dto/patch-feed.dto';
import { EcdsaAuthGuard } from '../auth/middleware/ecdsa-auth.guard';

@Controller('feed')
export class FeedController {
  constructor(private readonly feedEventService: FeedEventService) {}

  @Post()
  @UseGuards(EcdsaAuthGuard)
  async feedEvent(@Body() createFeedDTO: CreateFeedDTO): Promise<FeedResponse> {
    const event = await this.feedEventService.create(createFeedDTO);
    return {
      data: event,
      message: 'Feeder event created successfully!',
    };
  }

  @Get('events')
  async getFeedEvents(
    @Query('limit') limit: number,
    @Query('from') from: string,
    @Query('to') to: string,
  ): Promise<FeedEvent[]> {
    return this.feedEventService.find(limit, from, to);
  }

  @Patch()
  @UseGuards(EcdsaAuthGuard)
  async updateFeedEvent(
    @Body() patchFeedDTO: PatchFeedDTO,
  ): Promise<FeedResponse> {
    const event = await this.feedEventService.update(patchFeedDTO);
    return {
      data: event,
      message: 'Feeder event updated successfully!',
    };
  }
}
