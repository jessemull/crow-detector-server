import { ExecutionContext, HttpException } from '@nestjs/common';
import { InMemoryRateLimitGuard } from './in-memory-rate-limit.guard';

describe('InMemoryRateLimitGuard', () => {
  const makeContext = (ip: string, forwarded?: string): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          ip,
          headers: forwarded ? { 'x-forwarded-for': forwarded } : {},
        }),
      }),
    }) as ExecutionContext;

  it('allows requests under the limit', () => {
    const guard = new InMemoryRateLimitGuard(2, 60_000);
    expect(guard.canActivate(makeContext('1.1.1.1'))).toBe(true);
    expect(guard.canActivate(makeContext('1.1.1.1'))).toBe(true);
  });

  it('blocks when the client exceeds the window', () => {
    const guard = new InMemoryRateLimitGuard(1, 60_000);
    expect(guard.canActivate(makeContext('2.2.2.2'))).toBe(true);
    expect(() => guard.canActivate(makeContext('2.2.2.2'))).toThrow(
      HttpException,
    );
  });

  it('uses the first x-forwarded-for address when present', () => {
    const guard = new InMemoryRateLimitGuard(1, 60_000);
    expect(guard.canActivate(makeContext('9.9.9.9', '3.3.3.3, 4.4.4.4'))).toBe(
      true,
    );
    expect(() =>
      guard.canActivate(makeContext('9.9.9.9', '3.3.3.3, 4.4.4.4')),
    ).toThrow(HttpException);
  });
});
