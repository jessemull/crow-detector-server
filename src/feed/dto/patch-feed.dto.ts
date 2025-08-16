import { IsEnum, IsNumber, IsString, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';
import { Status } from 'src/common/types';

export class PatchFeedDTO {
  @IsUUID()
  id: string;

  @IsNumber()
  @Transform(({ value }) => Number(value))
  confidence: number;

  @IsString()
  croppedImageUrl: string;

  @IsEnum(Status)
  status: Status;
}
