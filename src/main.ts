import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { logger } from './common/logger/logger.config';
import { loadAppConfig } from './config/app.config';

/** Classify frames are up to 2_800_000 base64 characters, above Fastify's 1 MiB default. */
export const CLASSIFY_JSON_BODY_LIMIT_BYTES = 4 * 1024 * 1024;

export async function bootstrap() {
  try {
    const config = loadAppConfig();
    const app = await NestFactory.create<NestFastifyApplication>(
      AppModule,
      new FastifyAdapter({ bodyLimit: CLASSIFY_JSON_BODY_LIMIT_BYTES }),
    );

    app.useGlobalPipes(
      new ValidationPipe({
        forbidNonWhitelisted: true,
        transform: true,
        whitelist: true,
      }),
    );

    // The unlinked porch page on the Critter Canteen site calls the public clip list.
    app.enableCors({
      origin: config.corsAllowedOrigins,
      methods: ['GET', 'HEAD', 'PUT', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'x-device-id',
        'x-signature',
        'x-timestamp',
        'x-dev-mode',
      ],
    });

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
