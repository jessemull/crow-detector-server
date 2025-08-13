import { IsUrl, IsUUID } from 'class-validator';

export class CreateDetectionDTO {
  @IsUUID()
  feedEvent: string;

  @IsUrl()
  imageUrl: string;
}
