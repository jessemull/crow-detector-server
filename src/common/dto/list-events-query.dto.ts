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
          const parsed = new Date(value);
          if (Number.isNaN(parsed.getTime())) {
            return false;
          }
          return (
            parsed.getUTCFullYear() === Number(match[1]) &&
            parsed.getUTCMonth() + 1 === Number(match[2]) &&
            parsed.getUTCDate() === Number(match[3])
          );
        },
        defaultMessage: () => 'must be a real calendar date',
      },
    },
    options,
  );
}
