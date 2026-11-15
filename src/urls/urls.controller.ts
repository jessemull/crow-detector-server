import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import {
  CreateFeedImageUrlDto,
  CreateDetectionImageUrlDto,
  CreatePorchClipUrlDto,
} from './dto';
import { UrlsService } from './services/urls.service';
import { EcdsaAuthGuard } from '../auth/middleware/ecdsa-auth.guard';

@Controller('urls')
export class UrlsController {
  constructor(private readonly urlsService: UrlsService) {}

  @Post('feed')
  @UseGuards(EcdsaAuthGuard)
  async createFeedImageSignedUrl(
    @Body() createFeedImageUrlDto: CreateFeedImageUrlDto,
  ) {
    return this.urlsService.createFeedImageSignedUrl(createFeedImageUrlDto);
  }

  @Post('detection')
  @UseGuards(EcdsaAuthGuard)
  async createDetectionImageSignedUrl(
    @Body() createDetectionImageUrlDto: CreateDetectionImageUrlDto,
  ) {
    return this.urlsService.createDetectionImageSignedUrl(
      createDetectionImageUrlDto,
    );
  }

  @Post('porch')
  @UseGuards(EcdsaAuthGuard)
  async createPorchClipSignedUrl(
    @Body() createPorchClipUrlDto: CreatePorchClipUrlDto,
  ) {
    return this.urlsService.createPorchClipSignedUrl(createPorchClipUrlDto);
  }
}
