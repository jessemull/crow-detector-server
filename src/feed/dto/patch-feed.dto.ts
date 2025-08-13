import { IsEnum, IsNumber, IsString, IsUUID } from 'class-validator';
import { Status } from 'src/common/types';

export class PatchFeedDTO {
  @IsUUID()
  id: string;

  @IsNumber()
  confidence: number;

  @IsString()
  croppedImageUrl: string;

  @IsEnum(Status)
  status: Status;
}
