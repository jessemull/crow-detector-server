import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { DispenseStatus } from '../entity/dispense-request.entity';
import { FEEDER_OBJECT_KEY_MAX_LENGTH } from '../services/dispense-request.service';

export class CompleteDispenseDto {
  @IsIn([DispenseStatus.READY, DispenseStatus.FAILED])
  status!: DispenseStatus.READY | DispenseStatus.FAILED;

  @IsOptional()
  @IsString()
  @MaxLength(FEEDER_OBJECT_KEY_MAX_LENGTH)
  proofKey?: string;
}
