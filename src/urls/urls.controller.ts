import { Controller, Post, Body } from '@nestjs/common';
import { UrlsService } from './services/urls.service';
import { CreateFeedImageUrlDto, CreateDetectionImageUrlDto } from './dto';

@Controller('urls')
export class UrlsController {
  constructor(private readonly urlsService: UrlsService) {}

  @Post('feed')
  async createFeedImageSignedUrl(
    @Body() createFeedImageUrlDto: CreateFeedImageUrlDto,
  ) {
    return this.urlsService.createFeedImageSignedUrl(createFeedImageUrlDto);
  }

  @Post('detection')
  async createDetectionImageSignedUrl(
    @Body() createDetectionImageUrlDto: CreateDetectionImageUrlDto,
  ) {
    return this.urlsService.createDetectionImageSignedUrl(
      createDetectionImageUrlDto,
    );
  }
}
