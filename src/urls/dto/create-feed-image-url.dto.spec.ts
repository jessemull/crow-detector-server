import { CreateFeedImageUrlDto } from './create-feed-image-url.dto';
import { ImageFormat } from '../../common/types';
import { validate } from 'class-validator';

function validDto(): CreateFeedImageUrlDto {
  const dto = new CreateFeedImageUrlDto();
  dto.fileName = 'test-image';
  dto.format = ImageFormat.JPG;
  dto.source = 'pi-feeder-001';
  dto.contentLength = 1024;
  return dto;
}

describe('CreateFeedImageUrlDto', () => {
  it('passes with a bounded name and an exact byte length', async () => {
    expect(await validate(validDto())).toHaveLength(0);
  });

  it('rejects a path in the file name', async () => {
    const dto = validDto();
    dto.fileName = '../secret';
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

  it('rejects a body larger than 5 MB', async () => {
    const dto = validDto();
    dto.contentLength = 5 * 1024 * 1024 + 1;
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'contentLength')).toBe(
      true,
    );
  });

  it('requires source', async () => {
    const dto = validDto();
    dto.source = '';
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'source')).toBe(true);
  });
});
