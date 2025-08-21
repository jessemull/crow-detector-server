import { ImageFormat } from '../../common/types';
import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';

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
