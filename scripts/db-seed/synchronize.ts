#!/usr/bin/env ts-node

import { config } from 'dotenv';
import { DatabaseSeeder } from './seeder';
import { createLogger } from '../../src/common/logger/logger.config';

config();

async function main() {
  const logger = createLogger('Synchronize');
  const seeder = new DatabaseSeeder();

  try {
    await seeder.connect();
    await seeder.synchronize();
  } catch (error) {
    logger.error({ error }, 'Synchronization failed');
    process.exit(1);
  } finally {
    await seeder.disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    const logger = createLogger('Synchronize');
    logger.error({ error }, 'Unexpected error');
    process.exit(1);
  });
}
