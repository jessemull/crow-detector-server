import { IsNumber, IsUUID } from 'class-validator';

export class PatchDetectionDTO {
  @IsUUID()
  id: string;

  @IsNumber()
  confidence: number;

  @IsNumber()
  crowCount: number;
}