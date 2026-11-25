import { ImageFormat } from '../../common/types';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IMAGE_UPLOAD_MAX_BYTES } from './create-feed-image-url.dto';

const SAFE_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;

// Fields are assigned by the validation pipe from the request body.

export class CreateDetectionImageUrlDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @Matches(SAFE_FILE_NAME)
  fileName!: string;

  @IsEnum(ImageFormat)
  @IsNotEmpty()
  format!: ImageFormat;

  @IsInt()
  @Min(1)
  @Max(IMAGE_UPLOAD_MAX_BYTES)
  contentLength!: number;
}
