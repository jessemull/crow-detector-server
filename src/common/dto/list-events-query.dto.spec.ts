import 'reflect-metadata';
import { validate } from 'class-validator';
import { ListEventsQueryDto } from './list-events-query.dto';

function query(from: string): ListEventsQueryDto {
  const dto = new ListEventsQueryDto();
  dto.from = from;
  return dto;
}

describe('ListEventsQueryDto', () => {
  it('accepts an offset datetime whose UTC day differs from the prefix', async () => {
    const errors = await validate(query('2024-06-01T20:00:00-08:00'));
    expect(errors).toHaveLength(0);
  });

  it('rejects a calendar day that does not exist', async () => {
    const errors = await validate(query('2024-02-31'));
    expect(errors.some((error) => error.property === 'from')).toBe(true);
  });
});
