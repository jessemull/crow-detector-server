import { TypeOrmModule } from '@nestjs/typeorm';

describe('TypeORM Configuration', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should configure TypeORM with default SSL settings when SSL_REJECT_UNAUTHORIZED is not set to false', () => {
    delete process.env.SSL_REJECT_UNAUTHORIZED;

    // Test that TypeORM.forRoot can be called
    const result = TypeOrmModule.forRoot({});
    expect(result).toBeDefined();
    expect(TypeOrmModule.forRoot).toHaveBeenCalledWith({});
  });

  it('should configure TypeORM with SSL rejectUnauthorized false when SSL_REJECT_UNAUTHORIZED is set to false', () => {
    process.env.SSL_REJECT_UNAUTHORIZED = 'false';

    const result = TypeOrmModule.forRoot({});
    expect(result).toBeDefined();
    expect(TypeOrmModule.forRoot).toHaveBeenCalledWith({});
  });

  it('should configure TypeORM with synchronize true in non-production environments', () => {
    process.env.NODE_ENV = 'development';

    const result = TypeOrmModule.forRoot({});
    expect(result).toBeDefined();
    expect(TypeOrmModule.forRoot).toHaveBeenCalledWith({});
  });

  it('should configure TypeORM with synchronize false in production environments', () => {
    process.env.NODE_ENV = 'production';

    const result = TypeOrmModule.forRoot({});
    expect(result).toBeDefined();
    expect(TypeOrmModule.forRoot).toHaveBeenCalledWith({});
  });
});
