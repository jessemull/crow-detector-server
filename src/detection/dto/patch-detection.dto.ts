import { IsNumber, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';

export class PatchDetectionDTO {
  @IsUUID()
  id: string;

  @IsNumber()
  @Transform(({ value }) => Number(value))
  confidence: number;

  @IsNumber()
  @Transform(({ value }) => Number(value))
  crowCount: number;
}
