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

/** Signed image PUTs cannot exceed the cap enforced before Rekognition and sharp. */
export const IMAGE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

const SAFE_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;

// Fields are assigned by the validation pipe from the request body.

export class CreateFeedImageUrlDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @Matches(SAFE_FILE_NAME)
  fileName!: string;

  @IsEnum(ImageFormat)
  @IsNotEmpty()
  format!: ImageFormat;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  source!: string;

  @IsInt()
  @Min(1)
  @Max(IMAGE_UPLOAD_MAX_BYTES)
  contentLength!: number;
}
