import { config } from 'dotenv';

config({ path: '.env' });

process.env.NODE_ENV = 'test';
process.env.SSL_REJECT_UNAUTHORIZED = 'false';
