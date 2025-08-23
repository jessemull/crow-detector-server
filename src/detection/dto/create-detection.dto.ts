import { IsUrl } from 'class-validator';

export class CreateDetectionDTO {
  @IsUrl()
  imageUrl: string;
}
