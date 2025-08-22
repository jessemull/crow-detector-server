import { IsUrl } from 'class-validator';

export class CreateFeedDTO {
  @IsUrl()
  imageUrl: string;
}
