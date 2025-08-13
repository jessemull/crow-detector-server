import { DataSource } from 'typeorm';
import { DetectionEvent } from '../../src/detection/entity/detection-event.entity';
import { FeedEvent } from '../../src/feed/entity/feed-event.entity';
import { FeedEventSeeder, DetectionEventSeeder } from './seeders';

export class DatabaseSeeder {
  private dataSource: DataSource;

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
      console.log('Connected to database');
    } catch (error) {
      console.error('Failed to connect to database:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.dataSource.isInitialized) {
      await this.dataSource.destroy();
      console.log('Disconnected from database');
    }
  }

  async seed(): Promise<void> {
    try {
      console.log('Starting database seeding...');
      
      const feedEventSeeder = new FeedEventSeeder(this.dataSource);
      await feedEventSeeder.seed();

      const detectionEventSeeder = new DetectionEventSeeder(this.dataSource);
      await detectionEventSeeder.seed();

      console.log('Database seeding completed successfully!');
    } catch (error) {
      console.error('Seeding failed:', error);
      throw error;
    }
  }

  async reset(): Promise<void> {
    try {
      console.log('Starting database reset...');
      
      const detectionEventSeeder = new DetectionEventSeeder(this.dataSource);
      await detectionEventSeeder.clear();

      const feedEventSeeder = new FeedEventSeeder(this.dataSource);
      await feedEventSeeder.clear();

      console.log('Database reset completed successfully!');
    } catch (error) {
      console.error('Reset failed:', error);
      throw error;
    }
  }

  async synchronize(): Promise<void> {
    try {
      console.log('Starting database synchronization...');
      
      const detectionEventSeeder = new DetectionEventSeeder(this.dataSource);
      await detectionEventSeeder.drop();

      const feedEventSeeder = new FeedEventSeeder(this.dataSource);
      await feedEventSeeder.drop();

      console.log('Tables dropped successfully');
      console.log('Now restart your NestJS app to recreate tables with new schema');
      console.log('Then run: npm run db:seed');
      
    } catch (error) {
      console.error('Synchronization failed:', error);
      throw error;
    }
  }
} 