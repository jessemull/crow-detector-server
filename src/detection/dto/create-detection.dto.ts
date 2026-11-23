import { IsUrl } from 'class-validator';

// Fields are assigned by the validation pipe from the request body.

export class CreateDetectionDTO {
  @IsUrl()
  imageUrl!: string;
}
