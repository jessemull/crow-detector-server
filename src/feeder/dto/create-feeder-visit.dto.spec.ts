import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateFeederVisitDto } from './create-feeder-visit.dto';

describe('CreateFeederVisitDto', () => {
  it('accepts a feeder visit payload', async () => {
    const dto = plainToInstance(CreateFeederVisitDto, {
      videoKey: 'feeder/visit.mp4',
      animalCount: 2,
      crowCount: 1,
      detectedAnimals: [{ name: 'crow', confidence: 90, count: 1 }],
    });

    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects a video key that escapes the feeder prefix', async () => {
    const dto = plainToInstance(CreateFeederVisitDto, {
      videoKey: 'feeder/../porch/clip.mp4',
      animalCount: 1,
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'videoKey')).toBe(true);
  });

  it('rejects an animalCount below one', async () => {
    const dto = plainToInstance(CreateFeederVisitDto, {
      videoKey: 'feeder/visit.mp4',
      animalCount: 0,
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'animalCount')).toBe(true);
  });

  it('rejects more than twenty detected animals', async () => {
    const dto = plainToInstance(CreateFeederVisitDto, {
      videoKey: 'feeder/visit.mp4',
      animalCount: 1,
      detectedAnimals: Array.from({ length: 21 }, (_, index) => ({
        name: `animal-${index}`,
        confidence: 1,
        count: 1,
      })),
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'detectedAnimals')).toBe(
      true,
    );
  });
});
