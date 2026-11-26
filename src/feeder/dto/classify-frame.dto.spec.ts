import { validate } from 'class-validator';
import { ClassifyFrameDto } from './classify-frame.dto';

describe('ClassifyFrameDto', () => {
  it('accepts a jpeg frame under the base64 limit', async () => {
    const dto = new ClassifyFrameDto();
    dto.imageBase64 = Buffer.from('frame').toString('base64');
    dto.mediaType = 'image/jpeg';

    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects an empty image payload', async () => {
    const dto = new ClassifyFrameDto();
    dto.imageBase64 = '';
    dto.mediaType = 'image/jpeg';

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'imageBase64')).toBe(true);
  });

  it('rejects an unsupported media type', async () => {
    const dto = new ClassifyFrameDto();
    dto.imageBase64 = 'aaaa';
    dto.mediaType = 'image/gif' as ClassifyFrameDto['mediaType'];

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'mediaType')).toBe(true);
  });
});
