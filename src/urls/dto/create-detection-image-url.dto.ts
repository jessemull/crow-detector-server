import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';
import { ImageFormat } from '../../common/types';

export class CreateDetectionImageUrlDto {
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @IsEnum(ImageFormat)
  @IsNotEmpty()
  format: ImageFormat;

  @IsString()
  @IsNotEmpty()
  feedEventId: string;

  @IsString()
  @IsOptional()
  contentType?: string;
}
