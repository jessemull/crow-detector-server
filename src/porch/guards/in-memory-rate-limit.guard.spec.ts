import { ExecutionContext, HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
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

  it('can be constructed by Nest without constructor DI tokens', async () => {
    const module = await Test.createTestingModule({
      providers: [InMemoryRateLimitGuard],
    }).compile();

    expect(module.get(InMemoryRateLimitGuard)).toBeInstanceOf(
      InMemoryRateLimitGuard,
    );
  });

  it('allows requests under the limit', () => {
    const guard = new InMemoryRateLimitGuard().configure(2, 60_000);
    expect(guard.canActivate(makeContext('1.1.1.1'))).toBe(true);
    expect(guard.canActivate(makeContext('1.1.1.1'))).toBe(true);
  });

  it('blocks when the client exceeds the window', () => {
    const guard = new InMemoryRateLimitGuard().configure(1, 60_000);
    expect(guard.canActivate(makeContext('2.2.2.2'))).toBe(true);
    expect(() => guard.canActivate(makeContext('2.2.2.2'))).toThrow(
      HttpException,
    );
  });

  it('keys on request.ip and ignores a caller-supplied x-forwarded-for', () => {
    const guard = new InMemoryRateLimitGuard().configure(1, 60_000);
    expect(guard.canActivate(makeContext('3.3.3.3', '9.9.9.9, 3.3.3.3'))).toBe(
      true,
    );
    expect(guard.canActivate(makeContext('8.8.8.8', '9.9.9.9, 3.3.3.3'))).toBe(
      true,
    );
    expect(() => guard.canActivate(makeContext('3.3.3.3', '1.1.1.1'))).toThrow(
      HttpException,
    );
  });

  it('prunes stale client entries from the hit map', () => {
    const guard = new InMemoryRateLimitGuard().configure(2, 20);
    expect(guard.canActivate(makeContext('5.5.5.5'))).toBe(true);

    const hitsByClient = (guard as any).hitsByClient as Map<string, number[]>;
    hitsByClient.set('stale', [Date.now() - 1_000]);

    expect(guard.canActivate(makeContext('6.6.6.6'))).toBe(true);
    expect(hitsByClient.has('stale')).toBe(false);
  });
});
