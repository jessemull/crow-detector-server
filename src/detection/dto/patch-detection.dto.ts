import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ProcessingStatus } from 'src/common/types';

// Fields are assigned by the validation pipe from the request body.

export class DetectedAnimalDto {
  @IsString()
  @MaxLength(80)
  name!: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  confidence!: number;

  @IsNumber()
  @Min(1)
  count!: number;
}

export class PatchDetectionDTO {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  @Transform(({ value }) => blankToUndefined(value))
  @Type(() => Number)
  confidence?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => blankToUndefined(value))
  @Type(() => Number)
  crowCount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => blankToUndefined(value))
  @Type(() => Number)
  animalCount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => blankToUndefined(value))
  @Type(() => Number)
  processingDuration?: number;

  @IsOptional()
  @IsEnum(ProcessingStatus)
  processingStatus?: ProcessingStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  processingError?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DetectedAnimalDto)
  detectedAnimals?: DetectedAnimalDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => blankToUndefined(value))
  @Type(() => Number)
  originalImageSize?: number;
}

function blankToUndefined(value: unknown): unknown {
  if (value === null || value === '') {
    return undefined;
  }
  return value;
}
