import { validate } from 'class-validator';
import { CreateFeederClipUrlDto } from './create-feeder-clip-url.dto';

describe('CreateFeederClipUrlDto', () => {
  it('accepts a sized mp4 upload', async () => {
    const dto = new CreateFeederClipUrlDto();
    dto.fileName = 'clip-20261122-201000';
    dto.contentType = 'video/mp4';
    dto.contentLength = 4096;

    expect(await validate(dto)).toHaveLength(0);
  });

  it('requires a content length', async () => {
    const dto = new CreateFeederClipUrlDto();
    dto.fileName = 'clip-1';

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'contentLength')).toBe(
      true,
    );
  });

  it('rejects a content type other than video/mp4', async () => {
    const dto = new CreateFeederClipUrlDto();
    dto.fileName = 'clip-1';
    dto.contentLength = 128;
    dto.contentType = 'image/jpeg';

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'contentType')).toBe(true);
  });

  it('rejects a file name that contains a parent segment', async () => {
    const dto = new CreateFeederClipUrlDto();
    dto.fileName = 'clip..1';
    dto.contentLength = 128;

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'fileName')).toBe(true);
  });

  it('rejects a file name longer than 120 characters', async () => {
    const dto = new CreateFeederClipUrlDto();
    dto.fileName = 'a'.repeat(121);
    dto.contentLength = 128;

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'fileName')).toBe(true);
  });
});
