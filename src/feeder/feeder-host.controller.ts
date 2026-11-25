import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { EcdsaAuthGuard } from '../auth/middleware/ecdsa-auth.guard';
import { ClaudeService } from '../detection/services/claude.service';
import { AnimalAnalysisResult } from 'src/common/types';
import {
  DispenseRequest,
  DispenseStatus,
} from './entity/dispense-request.entity';
import { CompleteDispenseDto } from './dto/complete-dispense.dto';
import { ClassifyFrameDto } from './dto/classify-frame.dto';
import { CreateFeederVisitDto } from './dto/create-feeder-visit.dto';
import { DispenseRequestService } from './services/dispense-request.service';
import { FeederVisitService } from './services/feeder-visit.service';

type DeviceRequest = FastifyRequest & { deviceId?: string };

@Controller('feeder')
@UseGuards(EcdsaAuthGuard)
export class FeederHostController {
  constructor(
    private readonly dispenseRequestService: DispenseRequestService,
    private readonly feederVisitService: FeederVisitService,
    private readonly claudeService: ClaudeService,
  ) {}

  @Get('dispense/pending')
  async claimPending(
    @Req() request: DeviceRequest,
  ): Promise<{ request: DispenseRequest | null }> {
    this.assertFeeder(request);
    const claimed = await this.dispenseRequestService.claimNext();
    return { request: claimed };
  }

  @Patch('dispense/:id')
  async completeDispense(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CompleteDispenseDto,
    @Req() request: DeviceRequest,
  ): Promise<{ id: string; status: DispenseStatus }> {
    this.assertFeeder(request);
    const updated = await this.dispenseRequestService.complete(
      id,
      body.status,
      body.proofKey,
    );
    return { id: updated.id, status: updated.status };
  }

  @Post('classify')
  async classify(
    @Body() body: ClassifyFrameDto,
    @Req() request: DeviceRequest,
  ): Promise<AnimalAnalysisResult> {
    this.assertFeeder(request);
    const image = Buffer.from(body.imageBase64, 'base64');
    if (image.length === 0 || image.length > 2_000_000) {
      throw new ForbiddenException('Frame is empty or too large');
    }
    return this.claudeService.analyzeAnimalPhoto(image, body.mediaType);
  }

  @Post('visits')
  async createVisit(
    @Body() body: CreateFeederVisitDto,
    @Req() request: DeviceRequest,
  ): Promise<{ id: string }> {
    this.assertFeeder(request);
    const visit = await this.feederVisitService.create(body);
    return { id: visit.id };
  }

  private assertFeeder(request: DeviceRequest): void {
    if (request.deviceId !== 'pi-feeder' && request.deviceId !== 'dev-mode') {
      throw new ForbiddenException('Only the feeder host can call this route');
    }
  }
}
