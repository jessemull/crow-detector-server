import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Twelve seconds of a typical RTSP stream fits well under this cap. */
export const FEEDER_CLIP_MAX_BYTES = 100 * 1024 * 1024;

export const FEEDER_CLIP_CONTENT_TYPE = 'video/mp4';

export class CreateFeederClipUrlDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @Matches(/^(?!.*\.\.)[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/)
  fileName!: string;

  @IsInt()
  @Min(1)
  @Max(FEEDER_CLIP_MAX_BYTES)
  contentLength!: number;

  @IsOptional()
  @IsIn([FEEDER_CLIP_CONTENT_TYPE])
  contentType?: string;
}
