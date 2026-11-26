#!/usr/bin/env ts-node

import { DataSource } from 'typeorm';
import { DispenseRequest } from '../../src/feeder/entity/dispense-request.entity';
import { FeederVisit } from '../../src/feeder/entity/feeder-visit.entity';
import { config } from 'dotenv';
import { createLogger } from '../../src/common/logger/logger.config';
import { buildRdsSslOptions } from '../../src/config/rds-ca';

function postgresSsl(): { rejectUnauthorized: boolean; ca?: string } {
  const isProdLike =
    process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'prod';
  return buildRdsSslOptions(
    isProdLike || process.env.SSL_REJECT_UNAUTHORIZED !== 'false',
  );
}

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
    entities: [DispenseRequest, FeederVisit],
    synchronize: false,
    logging: true,
    ssl: postgresSsl(),
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

    const dispenseCount = await dataSource
      .getRepository(DispenseRequest)
      .count();
    const visitCount = await dataSource.getRepository(FeederVisit).count();

    logger.info(
      {
        dispenseRequests: dispenseCount,
        feederVisits: visitCount,
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
