import {
  Body,
  Controller,
  ForbiddenException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import {
  CreateFeedImageUrlDto,
  CreateDetectionImageUrlDto,
  CreatePorchClipUrlDto,
  CreateFeederClipUrlDto,
} from './dto';
import { UrlsService } from './services/urls.service';
import { EcdsaAuthGuard } from '../auth/middleware/ecdsa-auth.guard';

type DeviceRequest = FastifyRequest & { deviceId?: string };

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

  @Post('feeder')
  @UseGuards(EcdsaAuthGuard)
  async createFeederClipSignedUrl(
    @Body() createFeederClipUrlDto: CreateFeederClipUrlDto,
    @Req() request: DeviceRequest,
  ): Promise<{
    signedUrl: string;
    key: string;
    expiresAt: string;
    bucket: string;
    metadata: { timestamp: number; type: string };
  }> {
    if (request.deviceId !== 'pi-feeder' && request.deviceId !== 'dev-mode') {
      throw new ForbiddenException(
        'Only the feeder host can request feeder upload URLs',
      );
    }

    return this.urlsService.createFeederClipSignedUrl(createFeederClipUrlDto);
  }

  @Post('porch')
  @UseGuards(EcdsaAuthGuard)
  async createPorchClipSignedUrl(
    @Body() createPorchClipUrlDto: CreatePorchClipUrlDto,
    @Req() request: DeviceRequest,
  ) {
    // Porch uploads are only for the porch camera (plus local dev-mode bypass).
    if (request.deviceId !== 'pi-porch' && request.deviceId !== 'dev-mode') {
      throw new ForbiddenException(
        'Only the porch camera can request porch upload URLs',
      );
    }

    return this.urlsService.createPorchClipSignedUrl(createPorchClipUrlDto);
  }
}
