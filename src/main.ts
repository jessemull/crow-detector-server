import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { logger } from './common/logger/logger.config';
import { loadAppConfig } from './config/app.config';

export async function bootstrap() {
  try {
    const config = loadAppConfig();
    const app = await NestFactory.create<NestFastifyApplication>(
      AppModule,
      new FastifyAdapter(),
    );

    app.useGlobalPipes(
      new ValidationPipe({
        forbidNonWhitelisted: true,
        transform: true,
        whitelist: true,
      }),
    );

    await app.listen(config.port, '0.0.0.0');
    logger.info({ port: config.port }, 'Application started successfully');
    return app;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to start application',
    );
    process.exit(1);
  }
}

/* c8 ignore start */
if (require.main === module) {
  bootstrap().catch((error) => {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to start application',
    );
    process.exit(1);
  });
}
/* c8 ignore stop */
