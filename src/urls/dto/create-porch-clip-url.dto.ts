import {
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const PORCH_UPLOAD_MAX_BYTES = 100 * 1024 * 1024;

// Fields are assigned by the validation pipe from the request body.

export class CreatePorchClipUrlDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/)
  fileName!: string;

  @IsInt()
  @Min(1)
  @Max(PORCH_UPLOAD_MAX_BYTES)
  contentLength!: number;
}
