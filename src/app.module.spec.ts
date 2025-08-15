jest.mock('dotenv', () => ({
  config: jest.fn(),
}));

jest.mock('@nestjs/typeorm', () => {
  const original = jest.requireActual('@nestjs/typeorm');
  return {
    ...original,
    TypeOrmModule: {
      ...original.TypeOrmModule,
      forRoot: jest.fn((options) => options),
      forFeature: jest.fn(),
    },
  };
});

describe('AppModule SSL config', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    jest.resetModules(); // clear module cache
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('sets rejectUnauthorized to false when SSL_REJECT_UNAUTHORIZED is "false"', () => {
    process.env.SSL_REJECT_UNAUTHORIZED = 'false';
    const TypeOrmModule = require('@nestjs/typeorm').TypeOrmModule;
    const { AppModule } = require('./app.module');

    const sslConfig = (TypeOrmModule.forRoot as jest.Mock).mock.calls[0][0].ssl;
    expect(sslConfig.rejectUnauthorized).toBe(false);
  });

  it('defaults rejectUnauthorized to true when SSL_REJECT_UNAUTHORIZED is not "false"', () => {
    delete process.env.SSL_REJECT_UNAUTHORIZED; // make sure no env is set
    const TypeOrmModule = require('@nestjs/typeorm').TypeOrmModule;
    const { AppModule } = require('./app.module');

    const sslConfig = (TypeOrmModule.forRoot as jest.Mock).mock.calls[0][0].ssl;
    expect(sslConfig.rejectUnauthorized).toBe(true); // now this works
  });
});
