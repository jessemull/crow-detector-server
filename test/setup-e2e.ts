// Silence console logs during E2E tests
const originalLog = console.log;
console.log = jest.fn();

// Load environment variables
import { config } from 'dotenv';
config({ path: '.env' });

process.env.NODE_ENV = 'test';
process.env.SSL_REJECT_UNAUTHORIZED = 'false';
