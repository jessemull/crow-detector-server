/* eslint-disable @typescript-eslint/no-unsafe-return */
// Test setup file
import { config } from 'dotenv';

// Mock dotenv to be completely silent
jest.mock('dotenv', () => ({
  config: jest.fn().mockReturnValue({}),
}));

// Set test environment
process.env.NODE_ENV = 'test';

// Mock only the database connection, not the decorators
jest.mock('@nestjs/typeorm', () => {
  const original = jest.requireActual('@nestjs/typeorm');
  return {
    ...original,
    TypeOrmModule: {
      ...original.TypeOrmModule,
      forRoot: jest.fn().mockReturnValue({
        module: class MockTypeOrmModule {},
        providers: [],
      } as unknown as ReturnType<typeof original.TypeOrmModule.forRoot>),
      forFeature: jest.fn().mockReturnValue({
        module: class MockTypeOrmFeatureModule {},
        providers: [],
      } as unknown as ReturnType<typeof original.TypeOrmModule.forFeature>),
    },
  };
});

// Global test cleanup
afterAll(async () => {
  // Add any global cleanup here
  await new Promise((resolve) => setTimeout(resolve, 100));
});
