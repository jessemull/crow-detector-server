import { IsUrl, MaxLength } from 'class-validator';

// Fields are assigned by the validation pipe from the request body.

export class CreateDetectionDTO {
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  imageUrl!: string;
}
