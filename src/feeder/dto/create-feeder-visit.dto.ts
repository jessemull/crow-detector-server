import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

class DetectedAnimalDto {
  @IsString()
  name: string;

  @IsInt()
  confidence: number;

  @IsInt()
  @Min(1)
  count: number;
}

export class CreateFeederVisitDto {
  @IsString()
  videoKey: string;

  @IsInt()
  @Min(1)
  animalCount: number;

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
  @IsString()
  dispenseRequestId?: string;
}
