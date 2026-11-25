import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';

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
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}
