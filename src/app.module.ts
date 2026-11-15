import { ConfigModule } from '@nestjs/config';
import { DetectionModule } from './detection/detection.module';
import { FeedModule } from './feed/feed.module';
import { HealthModule } from './health/health.module';
import { Module } from '@nestjs/common';
import { PorchModule } from './porch/porch.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UrlsModule } from './urls/urls.module';
import configuration, {
  loadAppConfig,
  validateAppConfig,
} from './config/app.config';
import { buildRdsSslOptions } from './config/rds-ca';

const appConfig = loadAppConfig();
validateAppConfig(appConfig);

/** The running server must not rewrite tables. Schema changes belong in migrations. */
export const typeOrmSynchronize = false;

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    TypeOrmModule.forRoot({
      database: appConfig.rds.database,
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      host: appConfig.rds.host,
      password: appConfig.rds.password,
      port: appConfig.rds.port,
      synchronize: typeOrmSynchronize,
      type: 'postgres',
      username: appConfig.rds.username,
      ssl: buildRdsSslOptions(appConfig.rds.sslRejectUnauthorized),
    }),
    DetectionModule,
    FeedModule,
    HealthModule,
    PorchModule,
    UrlsModule,
  ],
})
export class AppModule {}
