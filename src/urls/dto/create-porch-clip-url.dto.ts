import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreatePorchClipUrlDto {
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @IsString()
  @IsOptional()
  contentType?: string;
}
