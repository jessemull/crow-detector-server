// main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';

export async function bootstrap() {
  try {
    const app = await NestFactory.create<NestFastifyApplication>(
      AppModule,
      new FastifyAdapter(),
    );
    const port = parseInt(process.env.PORT ?? '', 10) || 3000;
    await app.listen(port, '0.0.0.0');
    return app;
  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
  }
}

/* c8 ignore start */
if (require.main === module) {
  bootstrap().catch((error) => {
    console.error('Failed to start application:', error);
    process.exit(1);
  });
}
/* c8 ignore stop */
