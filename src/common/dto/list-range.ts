import { Between, FindOperator, LessThanOrEqual } from 'typeorm';
import { ListEventsQueryDto } from './list-events-query.dto';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** A date-only upper bound includes that whole UTC day. */
export function inclusiveEnd(value: string): Date {
  if (DATE_ONLY.test(value)) {
    return new Date(`${value}T23:59:59.999Z`);
  }
  return new Date(value);
}

export function createdAtFilter(
  query: ListEventsQueryDto,
): FindOperator<Date> | undefined {
  const to = query.to ? inclusiveEnd(query.to) : undefined;
  if (query.from && to) {
    return Between(new Date(query.from), to);
  }
  if (query.from) {
    return Between(new Date(query.from), new Date());
  }
  if (to) {
    return LessThanOrEqual(to);
  }
  return undefined;
}
