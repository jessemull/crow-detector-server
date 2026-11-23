import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

// Fields are assigned by the validation pipe from the request body.

export class CreatePorchClipUrlDto {
  @IsString()
  @IsNotEmpty()
  fileName!: string;

  @IsString()
  @IsOptional()
  contentType?: string;
}
