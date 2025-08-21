import { Controller, Post, Body } from '@nestjs/common';
import { CreateFeedImageUrlDto, CreateDetectionImageUrlDto } from './dto';
import { UrlsService } from './services/urls.service';

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
