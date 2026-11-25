import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { FEEDER_OBJECT_KEY_MAX_LENGTH } from '../services/dispense-request.service';

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
  count!: number;
}

export class CreateFeederVisitDto {
  @IsString()
  @MaxLength(FEEDER_OBJECT_KEY_MAX_LENGTH)
  videoKey!: string;

  @IsInt()
  @Min(1)
  animalCount!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  crowCount?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DetectedAnimalDto)
  detectedAnimals?: DetectedAnimalDto[];

  @IsOptional()
  @IsUUID()
  dispenseRequestId?: string;
}
