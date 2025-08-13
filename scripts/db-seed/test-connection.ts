#!/usr/bin/env ts-node

import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { FeedEvent } from '../../src/feed/entity/feed-event.entity';
import { DetectionEvent } from '../../src/detection/entity/detection-event.entity';

// Load environment variables
config();

async function testConnection() {
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
    console.log('Testing database connection...');
    console.log('Host:', process.env.RDS_HOST);
    console.log('Database:', process.env.RDS_DATABASE);
    console.log('Username:', process.env.RDS_USERNAME);
    console.log('SSL Reject Unauthorized:', process.env.SSL_REJECT_UNAUTHORIZED);
    
    await dataSource.initialize();
          console.log('Database connection successful!');
    
    // Test a simple query
    const result = await dataSource.query('SELECT NOW() as current_time');
    console.log('Current database time:', result[0].current_time);
    
    // Check table counts
    const feedEventCount = await dataSource.getRepository(FeedEvent).count();
    const detectionEventCount = await dataSource.getRepository(DetectionEvent).count();
    
    console.log('Current table counts:');
    console.log('  - Feed Events:', feedEventCount);
    console.log('  - Detection Events:', detectionEventCount);
    
  } catch (error) {
          console.error('Database connection failed:', error);
    process.exit(1);
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
      console.log('Connection closed');
    }
  }
}

if (require.main === module) {
  testConnection().catch((error) => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
} 