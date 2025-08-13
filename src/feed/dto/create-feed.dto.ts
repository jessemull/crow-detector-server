import { IsEnum, IsUrl } from 'class-validator';
import { Source } from 'src/common/types';

export class CreateFeedDTO {
  @IsUrl()
  imageUrl: string;

  @IsEnum(Source)
  source: Source;
}
