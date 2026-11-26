import { DataSource } from 'typeorm';
import { DispenseRequest } from '../../src/feeder/entity/dispense-request.entity';
import { FeederVisit } from '../../src/feeder/entity/feeder-visit.entity';
import { createLogger } from '../../src/common/logger/logger.config';
import { buildRdsSslOptions } from '../../src/config/rds-ca';

function assertLocalDatabase(operation: string): void {
  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv !== 'development' && nodeEnv !== 'test') {
    throw new Error(
      `Refusing to ${operation} unless NODE_ENV is development or test`,
    );
  }
}

function postgresSsl(): { rejectUnauthorized: boolean; ca?: string } {
  const isProdLike =
    process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'prod';
  return buildRdsSslOptions(
    isProdLike || process.env.SSL_REJECT_UNAUTHORIZED !== 'false',
  );
}

export class DatabaseSeeder {
  private dataSource: DataSource;
  private logger = createLogger('DatabaseSeeder');

  constructor() {
    this.dataSource = new DataSource({
      type: 'postgres',
      host: process.env.RDS_HOST,
      port: parseInt(process.env.RDS_PORT || '5432'),
      username: process.env.RDS_USERNAME,
      password: process.env.RDS_PASSWORD,
      database: process.env.RDS_DATABASE,
      entities: [DispenseRequest, FeederVisit],
      synchronize: false,
      logging: process.env.NODE_ENV === 'development',
      ssl: postgresSsl(),
    });
  }

  async connect(): Promise<void> {
    try {
      await this.dataSource.initialize();
      this.logger.info('Connected to database');
    } catch (error) {
      this.logger.error({ error }, 'Failed to connect to database');
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.dataSource.isInitialized) {
      await this.dataSource.destroy();
      this.logger.info('Disconnected from database');
    }
  }

  seed(): void {
    assertLocalDatabase('seed');
    this.logger.info(
      'No feed or detection seeders remain. Apply scripts/db-seed/feeder-video.sql for feeder tables.',
    );
  }

  reset(): void {
    assertLocalDatabase('reset');
    this.logger.info(
      'No feed or detection seeders remain. Drop those tables with scripts/db-seed/drop-photo-pipeline.sql.',
    );
  }

  synchronize(): void {
    assertLocalDatabase('synchronize');
    this.logger.info(
      'Nest will not recreate tables: TypeORM synchronize is false.',
    );
    this.logger.info(
      'Apply schema by hand (scripts/db-seed/*.sql), then seed if needed.',
    );
  }
}
