#!/usr/bin/env ts-node

import { config } from 'dotenv';
import { DatabaseSeeder } from './seeder';

config();

async function main() {
  const seeder = new DatabaseSeeder();
  
  try {
    await seeder.connect();
    await seeder.synchronize();
  } catch (error) {
    console.error('Synchronization failed:', error);
    process.exit(1);
  } finally {
    await seeder.disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
} 