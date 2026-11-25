import { IsEnum, IsIn, IsOptional, IsUrl, MaxLength } from 'class-validator';
import { FeedEventStatus } from '../../common/types';

const FEED_STATUS_TRANSITIONS = [
  FeedEventStatus.FEEDING,
  FeedEventStatus.FEEDING_COMPLETE,
  FeedEventStatus.PHOTO_TAKEN,
  FeedEventStatus.COMPLETE,
] as const;

// Fields are assigned by the validation pipe from the request body.

export class UpdateFeedStatusDto {
  @IsEnum(FeedEventStatus)
  @IsIn(FEED_STATUS_TRANSITIONS)
  status!: FeedEventStatus;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  photoUrl?: string;
}
