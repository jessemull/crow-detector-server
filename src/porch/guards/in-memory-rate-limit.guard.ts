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

  constructor(
    private readonly maxRequests = 30,
    private readonly windowMs = 60_000,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const clientKey = this.clientKey(request);
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const recent = (this.hitsByClient.get(clientKey) || []).filter(
      (timestamp) => timestamp > windowStart,
    );

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

  private clientKey(request: FastifyRequest): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      return forwarded.split(',')[0].trim();
    }
    if (Array.isArray(forwarded) && forwarded[0]) {
      return forwarded[0].split(',')[0].trim();
    }
    return request.ip || 'unknown';
  }
}
