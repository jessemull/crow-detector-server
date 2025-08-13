import dotenv from 'dotenv';
import { DetectionModule } from './detection/detection.module';
import { FeedModule } from './feed/feed.module';
import { HealthModule } from './health/health.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

dotenv.config();

@Module({
  imports: [
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
        rejectUnauthorized:
          process.env.SSL_REJECT_UNAUTHORIZED === 'false' ? false : true,
      },
    }),
    DetectionModule,
    FeedModule,
    HealthModule,
  ],
})
export class AppModule {}
