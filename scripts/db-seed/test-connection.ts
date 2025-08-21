#!/usr/bin/env ts-node

import { DataSource } from 'typeorm';
import { DetectionEvent } from '../../src/detection/entity/detection-event.entity';
import { FeedEvent } from '../../src/feed/entity/feed-event.entity';
import { config } from 'dotenv';
import { createLogger } from '../../src/common/logger/logger.config';

config();

async function testConnection() {
  const logger = createLogger('TestConnection');

  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.RDS_HOST,
    port: parseInt(process.env.RDS_PORT || '5432'),
    username: process.env.RDS_USERNAME,
    password: process.env.RDS_PASSWORD,
    database: process.env.RDS_DATABASE,
    entities: [FeedEvent, DetectionEvent],
    synchronize: false,
    logging: true,
    ssl: {
      rejectUnauthorized: process.env.SSL_REJECT_UNAUTHORIZED === 'true',
    },
  });

  try {
    logger.info('Testing database connection...');
    logger.info(
      {
        host: process.env.RDS_HOST,
        database: process.env.RDS_DATABASE,
        username: process.env.RDS_USERNAME,
        sslRejectUnauthorized: process.env.SSL_REJECT_UNAUTHORIZED,
      },
      'Connection parameters',
    );

    await dataSource.initialize();
    logger.info('Database connection successful!');

    const result = await dataSource.query('SELECT NOW() as current_time');
    logger.info(
      { currentTime: result[0].current_time },
      'Current database time',
    );

    const feedEventCount = await dataSource.getRepository(FeedEvent).count();
    const detectionEventCount = await dataSource
      .getRepository(DetectionEvent)
      .count();

    logger.info(
      {
        feedEvents: feedEventCount,
        detectionEvents: detectionEventCount,
      },
      'Current table counts',
    );
  } catch (error) {
    logger.error({ error }, 'Database connection failed');
    process.exit(1);
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
      logger.info('Connection closed');
    }
  }
}

if (require.main === module) {
  testConnection().catch((error) => {
    const logger = createLogger('TestConnection');
    logger.error({ error }, 'Unexpected error');
    process.exit(1);
  });
}
