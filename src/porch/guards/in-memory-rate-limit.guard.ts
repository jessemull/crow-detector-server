import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';

/** One ECS task means a process-local window is enough for the public clip list. */
@Injectable()
export class InMemoryRateLimitGuard implements CanActivate {
  private readonly hitsByClient = new Map<string, number[]>();
  private maxRequests = 30;
  private windowMs = 60_000;

  /**
   * Nest must construct this with no injectable params — numeric defaults in the
   * constructor were treated as DI tokens and crashed the porch module on boot.
   * Tests call {@link configure} to tighten the window.
   */
  configure(maxRequests: number, windowMs: number): this {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    return this;
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const clientKey = this.clientKey(request);
    const now = Date.now();
    const windowStart = now - this.windowMs;

    this.prune(windowStart);

    const recent = this.hitsByClient.get(clientKey) || [];

    if (recent.length >= this.maxRequests) {
      throw new HttpException(
        'Too many clip list requests. Try again in a minute.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    recent.push(now);
    this.hitsByClient.set(clientKey, recent);
    return true;
  }

  private prune(windowStart: number): void {
    for (const [key, hits] of this.hitsByClient) {
      const filtered = hits.filter((timestamp) => timestamp > windowStart);
      if (filtered.length === 0) {
        this.hitsByClient.delete(key);
      } else {
        this.hitsByClient.set(key, filtered);
      }
    }
  }

  private clientKey(request: FastifyRequest): string {
    // request.ip is the address the trusted proxy appended. The raw header is
    // caller-controlled and must not be the key.

    if (typeof request.ip === 'string' && request.ip.length > 0) {
      return request.ip;
    }

    return 'unknown';
  }
}
