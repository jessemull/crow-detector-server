import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';
import { ImageFormat } from '../../common/types';

export class CreateFeedImageUrlDto {
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @IsEnum(ImageFormat)
  @IsNotEmpty()
  format: ImageFormat;

  @IsString()
  @IsNotEmpty()
  source: string; // e.g., 'pi-feeder', 'pi-motion'

  @IsString()
  @IsOptional()
  contentType?: string;
}
