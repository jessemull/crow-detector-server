jest.mock('dotenv', () => ({
  config: jest.fn().mockReturnValue({}),
}));

jest.mock('../src/common/logger/logger.config', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    fatal: jest.fn(),
  })),
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    fatal: jest.fn(),
  },
}));

process.env.NODE_ENV = 'test';

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

afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 100));
});
