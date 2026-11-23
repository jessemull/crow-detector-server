import { IsEnum, IsOptional, IsString } from 'class-validator';
import { FeedEventStatus } from '../../common/types';

// Fields are assigned by the validation pipe from the request body.

export class UpdateFeedStatusDto {
  @IsEnum(FeedEventStatus)
  status!: FeedEventStatus;

  @IsOptional()
  @IsString()
  photoUrl?: string;
}
