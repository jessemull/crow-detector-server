import { IsEnum, IsOptional, IsString } from 'class-validator';
import { FeedEventStatus } from '../../common/types';

export class UpdateFeedStatusDto {
  @IsEnum(FeedEventStatus)
  status: FeedEventStatus;

  @IsOptional()
  @IsString()
  photoUrl?: string;
}
