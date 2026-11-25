import { CreateDetectionImageUrlDto } from './create-detection-image-url.dto';
import { ImageFormat } from '../../common/types';
import { validate } from 'class-validator';

function validDto(): CreateDetectionImageUrlDto {
  const dto = new CreateDetectionImageUrlDto();
  dto.fileName = 'motion-detected';
  dto.format = ImageFormat.PNG;
  dto.contentLength = 1024;
  return dto;
}

describe('CreateDetectionImageUrlDto', () => {
  it('passes with a bounded name and an exact byte length', async () => {
    expect(await validate(validDto())).toHaveLength(0);
  });

  it('accepts every image format', async () => {
    for (const format of Object.values(ImageFormat)) {
      const dto = validDto();
      dto.format = format;
      expect(await validate(dto)).toHaveLength(0);
    }
  });

  it('rejects a path in the file name', async () => {
    const dto = validDto();
    dto.fileName = 'a/b';
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'fileName')).toBe(true);
  });

  it('requires contentLength', async () => {
    const dto = validDto();
    dto.contentLength = undefined as unknown as number;
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'contentLength')).toBe(
      true,
    );
  });
});
