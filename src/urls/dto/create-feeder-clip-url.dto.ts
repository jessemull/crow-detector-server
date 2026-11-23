import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

/** Twelve seconds of a typical RTSP stream fits well under this cap. */
export const FEEDER_CLIP_MAX_BYTES = 100 * 1024 * 1024;

export const FEEDER_CLIP_CONTENT_TYPE = 'video/mp4';

export class CreateFeederClipUrlDto {
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @IsInt()
  @Min(1)
  @Max(FEEDER_CLIP_MAX_BYTES)
  contentLength: number;

  @IsOptional()
  @IsIn([FEEDER_CLIP_CONTENT_TYPE])
  contentType?: string;
}
