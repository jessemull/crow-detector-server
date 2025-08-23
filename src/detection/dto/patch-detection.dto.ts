import { IsNumber, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

export class PatchDetectionDTO {
  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => Number(value))
  confidence?: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => Number(value))
  crowCount?: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => Number(value))
  animalCount?: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => Number(value))
  processingDuration?: number;

  @IsOptional()
  processingStatus?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

  @IsOptional()
  processingError?: string;

  @IsOptional()
  detectedAnimals?: string; // JSON string of detected animals

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => Number(value))
  originalImageSize?: number;
}
