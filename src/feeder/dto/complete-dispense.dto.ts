import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { DispenseStatus } from '../entity/dispense-request.entity';
import { FEEDER_OBJECT_KEY_MAX_LENGTH } from '../services/dispense-request.service';

/** Feeder object key: feeder/<safe-path>.mp4 without ".." segments. */
export const FEEDER_MP4_KEY_PATTERN =
  /^feeder\/(?!.*\.\.)[A-Za-z0-9._/-]+\.mp4$/;

export class CompleteDispenseDto {
  @IsIn([DispenseStatus.READY, DispenseStatus.FAILED])
  status!: DispenseStatus.READY | DispenseStatus.FAILED;

  @IsOptional()
  @IsString()
  @MaxLength(FEEDER_OBJECT_KEY_MAX_LENGTH)
  @Matches(FEEDER_MP4_KEY_PATTERN)
  proofKey?: string;
}
