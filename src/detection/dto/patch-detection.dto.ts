import { IsNumber, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { ProcessingStatus, DetectedAnimal } from 'src/common/types';

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
  processingStatus?: ProcessingStatus;

  @IsOptional()
  processingError?: string;

  @IsOptional()
  detectedAnimals?: DetectedAnimal[];

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => Number(value))
  originalImageSize?: number;
}
