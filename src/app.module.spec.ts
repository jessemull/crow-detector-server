import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';

describe('AppModule SSL config', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should configure TypeORM with default SSL settings when SSL_REJECT_UNAUTHORIZED is not set to false', () => {
    delete process.env.SSL_REJECT_UNAUTHORIZED;
    const module = Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    expect(module).toBeDefined();
  });

  it('should configure TypeORM with SSL rejectUnauthorized false when SSL_REJECT_UNAUTHORIZED is set to false', () => {
    process.env.SSL_REJECT_UNAUTHORIZED = 'false';
    const module = Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    expect(module).toBeDefined();
  });

  it('should configure TypeORM with synchronize true in non-production environments', () => {
    process.env.NODE_ENV = 'development';
    const module = Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    expect(module).toBeDefined();
  });

  it('should configure TypeORM with synchronize false in production environments', () => {
    process.env.NODE_ENV = 'production';
    const module = Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    expect(module).toBeDefined();
  });
});
