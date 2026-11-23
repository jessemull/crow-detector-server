import { IsIn, IsOptional, IsString } from 'class-validator';
import { DispenseStatus } from '../entity/dispense-request.entity';

export class CompleteDispenseDto {
  @IsIn([DispenseStatus.READY, DispenseStatus.FAILED])
  status: DispenseStatus.READY | DispenseStatus.FAILED;

  @IsOptional()
  @IsString()
  proofKey?: string;
}
