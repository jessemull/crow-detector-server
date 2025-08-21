import { DataSource } from 'typeorm';
import { DetectionEvent } from '../../src/detection/entity/detection-event.entity';
import { FeedEvent } from '../../src/feed/entity/feed-event.entity';
import { FeedEventSeeder, DetectionEventSeeder } from './seeders';
import { createLogger } from '../../src/common/logger/logger.config';

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
      entities: [FeedEvent, DetectionEvent],
      synchronize: false,
      logging: process.env.NODE_ENV === 'development',
      ssl: {
        rejectUnauthorized: process.env.SSL_REJECT_UNAUTHORIZED === 'true',
      },
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

  async seed(): Promise<void> {
    try {
      this.logger.info('Starting database seeding...');

      const feedEventSeeder = new FeedEventSeeder(this.dataSource);
      await feedEventSeeder.seed();

      const detectionEventSeeder = new DetectionEventSeeder(this.dataSource);
      await detectionEventSeeder.seed();

      this.logger.info('Database seeding completed successfully!');
    } catch (error) {
      this.logger.error({ error }, 'Seeding failed');
      throw error;
    }
  }

  async reset(): Promise<void> {
    try {
      this.logger.info('Starting database reset...');

      const detectionEventSeeder = new DetectionEventSeeder(this.dataSource);
      await detectionEventSeeder.clear();

      const feedEventSeeder = new FeedEventSeeder(this.dataSource);
      await feedEventSeeder.clear();

      this.logger.info('Database reset completed successfully!');
    } catch (error) {
      this.logger.error({ error }, 'Reset failed');
      throw error;
    }
  }

  async synchronize(): Promise<void> {
    try {
      this.logger.info('Starting database synchronization...');

      const detectionEventSeeder = new DetectionEventSeeder(this.dataSource);
      await detectionEventSeeder.drop();

      const feedEventSeeder = new FeedEventSeeder(this.dataSource);
      await feedEventSeeder.drop();

      this.logger.info('Tables dropped successfully');
      this.logger.info(
        'Now restart your NestJS app to recreate tables with new schema',
      );
      this.logger.info('Then run: npm run db:seed');
    } catch (error) {
      this.logger.error({ error }, 'Synchronization failed');
      throw error;
    }
  }
}
