import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ClassifyFrameDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2_800_000)
  imageBase64: string;

  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
}
