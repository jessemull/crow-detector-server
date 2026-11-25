import { Type } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsOptional,
  Max,
  Min,
  ValidateBy,
  ValidationOptions,
} from 'class-validator';

export const LIST_LIMIT_DEFAULT = 50;
export const LIST_LIMIT_MAX = 100;

// Fields are assigned by the validation pipe from the query string.

export class ListEventsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(LIST_LIMIT_MAX)
  limit: number = LIST_LIMIT_DEFAULT;

  @IsOptional()
  @IsISO8601()
  @IsRealCalendarDate()
  from?: string;

  @IsOptional()
  @IsISO8601()
  @IsRealCalendarDate()
  to?: string;
}

function IsRealCalendarDate(options?: ValidationOptions) {
  return ValidateBy(
    {
      name: 'isRealCalendarDate',
      validator: {
        validate: (value: unknown) => {
          if (typeof value !== 'string') {
            return false;
          }
          const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
          if (!match) {
            return false;
          }
          const year = Number(match[1]);
          const month = Number(match[2]);
          const day = Number(match[3]);
          const calendar = new Date(Date.UTC(year, month - 1, day));
          const realDay =
            calendar.getUTCFullYear() === year &&
            calendar.getUTCMonth() + 1 === month &&
            calendar.getUTCDate() === day;
          return realDay && !Number.isNaN(new Date(value).getTime());
        },
        defaultMessage: () => 'must be a real calendar date',
      },
    },
    options,
  );
}
