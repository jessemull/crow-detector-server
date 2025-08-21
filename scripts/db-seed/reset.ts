#!/usr/bin/env ts-node

import { config } from 'dotenv';
import { DatabaseSeeder } from './seeder';
import { createLogger } from '../../src/common/logger/logger.config';

config();

async function main() {
  const logger = createLogger('Reset');
  const seeder = new DatabaseSeeder();

  try {
    await seeder.connect();
    await seeder.reset();
  } catch (error) {
    logger.error({ error }, 'Reset failed');
    process.exit(1);
  } finally {
    await seeder.disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    const logger = createLogger('Reset');
    logger.error({ error }, 'Unexpected error');
    process.exit(1);
  });
}
