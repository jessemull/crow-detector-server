import { ConfigModule } from '@nestjs/config';
import { DetectionModule } from './detection/detection.module';
import { FeedModule } from './feed/feed.module';
import { HealthModule } from './health/health.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UrlsModule } from './urls/urls.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRoot({
      database: process.env.RDS_DATABASE,
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      host: process.env.RDS_HOST,
      password: process.env.RDS_PASSWORD,
      port: 5432,
      synchronize: process.env.NODE_ENV !== 'production',
      type: 'postgres',
      username: process.env.RDS_USERNAME,
      ssl: {
        rejectUnauthorized: false,
      },
    }),
    DetectionModule,
    FeedModule,
    HealthModule,
    UrlsModule,
  ],
})
export class AppModule {}
