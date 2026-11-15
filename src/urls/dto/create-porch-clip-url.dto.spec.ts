import { validate } from 'class-validator';
import { CreatePorchClipUrlDto } from './create-porch-clip-url.dto';

describe('CreatePorchClipUrlDto', () => {
  it('accepts a clip file name', async () => {
    const dto = new CreatePorchClipUrlDto();
    dto.fileName = 'clip-20261114-210000';
    dto.contentType = 'video/mp4';

    expect(await validate(dto)).toHaveLength(0);
  });

  it('requires a file name', async () => {
    const dto = new CreatePorchClipUrlDto();
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'fileName')).toBe(true);
  });
});
