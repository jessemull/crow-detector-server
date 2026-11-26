import { loadAppConfig, validateAppConfig } from './app.config';

describe('app.config', () => {
  const baseEnv = {
    NODE_ENV: 'development',
    PORT: '3000',
  };

  it('loads defaults for optional values', () => {
    const config = loadAppConfig({ ...baseEnv });
    expect(config.port).toBe(3000);
    expect(config.awsRegion).toBe('us-west-2');
    expect(config.rds.sslRejectUnauthorized).toBe(true);
    expect(config.rds.port).toBe(5432);
  });

  it('disables TLS verify only outside production when SSL_REJECT_UNAUTHORIZED=false', () => {
    const config = loadAppConfig({
      ...baseEnv,
      SSL_REJECT_UNAUTHORIZED: 'false',
    });
    expect(config.rds.sslRejectUnauthorized).toBe(false);
  });

  it('forces RDS CA verification in production even if SSL_REJECT_UNAUTHORIZED=false', () => {
    const config = loadAppConfig({
      NODE_ENV: 'production',
      SSL_REJECT_UNAUTHORIZED: 'false',
    });
    expect(config.rds.sslRejectUnauthorized).toBe(true);
  });

  it('does not fail validation in development when secrets are missing', () => {
    expect(() =>
      validateAppConfig(loadAppConfig({ ...baseEnv })),
    ).not.toThrow();
  });

  it('fails fast in production when required secrets are missing', () => {
    expect(() =>
      validateAppConfig(
        loadAppConfig({
          NODE_ENV: 'production',
        }),
      ),
    ).toThrow(/Missing required environment variables/);
  });

  it('passes production validation when required secrets are present', () => {
    expect(() =>
      validateAppConfig(
        loadAppConfig({
          NODE_ENV: 'production',
          RDS_HOST: 'db.example',
          RDS_DATABASE: 'crow',
          RDS_USERNAME: 'user',
          RDS_PASSWORD: 'pass',
          S3_BUCKET_NAME: 'bucket',
          CLAUDE_API_KEY: 'key',
          PI_USER_PUBLIC_KEY: 'a',
          PI_FEEDER_PUBLIC_KEY: 'c',
          PI_PORCH_PUBLIC_KEY: 'e',
        }),
      ),
    ).not.toThrow();
  });

  it('loads default CORS origins for the public site', () => {
    const config = loadAppConfig({ NODE_ENV: 'production' });
    expect(config.corsAllowedOrigins).toContain(
      'https://www.crittercanteen.com',
    );
    expect(config.corsAllowedOrigins).not.toContain('http://localhost:8080');
  });

  it('allows local Next and proxy origins on the ECS dev environment', () => {
    const config = loadAppConfig({ NODE_ENV: 'dev' });
    expect(config.corsAllowedOrigins).toEqual(
      expect.arrayContaining([
        'https://www.crittercanteen.com',
        'http://localhost:3000',
        'http://localhost:8080',
      ]),
    );
  });

  it('parses CORS_ALLOWED_ORIGINS when set', () => {
    const config = loadAppConfig({
      ...baseEnv,
      CORS_ALLOWED_ORIGINS: 'https://a.example, https://b.example',
    });
    expect(config.corsAllowedOrigins).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
  });
});
