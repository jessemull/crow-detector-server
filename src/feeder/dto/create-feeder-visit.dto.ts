import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { FEEDER_OBJECT_KEY_MAX_LENGTH } from '../services/dispense-request.service';
import { FEEDER_MP4_KEY_PATTERN } from './complete-dispense.dto';

class DetectedAnimalDto {
  @IsString()
  @MaxLength(80)
  name!: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  confidence!: number;

  @IsInt()
  @Min(1)
  @Max(100)
  count!: number;
}

export class CreateFeederVisitDto {
  @IsString()
  @MaxLength(FEEDER_OBJECT_KEY_MAX_LENGTH)
  @Matches(FEEDER_MP4_KEY_PATTERN)
  videoKey!: string;

  @IsInt()
  @Min(1)
  @Max(100)
  animalCount!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  crowCount?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => DetectedAnimalDto)
  detectedAnimals?: DetectedAnimalDto[];

  @IsOptional()
  @IsUUID()
  dispenseRequestId?: string;
}
