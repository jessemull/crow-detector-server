import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ProcessingStatus, Source, Status } from 'src/common/types';

export class PatchFeedDTO {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  @Transform(({ value }) => optionalNumber(value))
  confidence?: number;

  @IsOptional()
  @IsString()
  @Matches(/^processed\/[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/)
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
  @Min(0)
  @Transform(({ value }) => optionalNumber(value))
  originalImageSize?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => optionalNumber(value))
  processedImageSize?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => optionalNumber(value))
  processingDuration?: number;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }
  return Number(value);
}
