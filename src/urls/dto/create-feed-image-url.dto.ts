import { ImageFormat } from '../../common/types';
import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';

// Fields are assigned by the validation pipe from the request body.

export class CreateFeedImageUrlDto {
  @IsString()
  @IsNotEmpty()
  fileName!: string;

  @IsEnum(ImageFormat)
  @IsNotEmpty()
  format!: ImageFormat;

  @IsString()
  @IsNotEmpty()
  source!: string;

  @IsString()
  @IsOptional()
  contentType?: string;
}
