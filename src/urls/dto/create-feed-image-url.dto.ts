import { ImageFormat } from '../../common/types';
import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';

export class CreateFeedImageUrlDto {
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @IsEnum(ImageFormat)
  @IsNotEmpty()
  format: ImageFormat;

  @IsString()
  @IsNotEmpty()
  source: string;

  @IsString()
  @IsOptional()
  contentType?: string;
}
