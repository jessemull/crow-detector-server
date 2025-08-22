import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ProcessingStatus, Source, Status } from 'src/common/types';

export class PatchFeedDTO {
  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => Number(value))
  confidence?: number;

  @IsOptional()
  @IsString()
  croppedImageUrl?: string;

  @IsOptional()
  @IsBoolean()
  isAppropriate?: boolean;

  @IsOptional()
  @IsEnum(Source)
  source?: Source;

  @IsOptional()
  @IsEnum(Status)
  status?: Status;

  @IsOptional()
  @IsEnum(ProcessingStatus)
  processingStatus?: ProcessingStatus;

  @IsOptional()
  @IsString()
  processingError?: string;

  @IsOptional()
  @IsString()
  moderationLabels?: string;

  @IsOptional()
  @IsBoolean()
  faceDetected?: boolean;

  @IsOptional()
  @IsString()
  faceBoundingBox?: string;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => Number(value))
  originalImageSize?: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => Number(value))
  processedImageSize?: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => Number(value))
  processingDuration?: number;
}
