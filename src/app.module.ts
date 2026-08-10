import { ConfigModule } from '@nestjs/config';
import { DetectionModule } from './detection/detection.module';
import { FeedModule } from './feed/feed.module';
import { HealthModule } from './health/health.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UrlsModule } from './urls/urls.module';
import configuration, {
  loadAppConfig,
  validateAppConfig,
} from './config/app.config';

const appConfig = loadAppConfig();
validateAppConfig(appConfig);

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
      synchronize:
        appConfig.nodeEnv !== 'production' && appConfig.nodeEnv !== 'prod',
      type: 'postgres',
      username: appConfig.rds.username,
      ssl: {
        // Prefer verifying the RDS CA. Production/prod always verifies;
        // SSL_REJECT_UNAUTHORIZED=false is a non-prod temporary opt-out only.
        rejectUnauthorized: appConfig.rds.sslRejectUnauthorized,
      },
    }),
    DetectionModule,
    FeedModule,
    HealthModule,
    UrlsModule,
  ],
})
export class AppModule {}
