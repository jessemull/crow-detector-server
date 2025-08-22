import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('database')
  checkDatabase() {
    return this.health.check([() => this.db.pingCheck('database')]);
  }
}
