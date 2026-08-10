import { loadAppConfig } from './config/app.config';

describe('AppModule configuration helpers', () => {
  it('should configure SSL rejectUnauthorized as true by default', () => {
    const config = loadAppConfig({});
    expect(config.rds.sslRejectUnauthorized).toBe(true);
  });

  it('should configure SSL rejectUnauthorized as false when SSL_REJECT_UNAUTHORIZED=false', () => {
    const config = loadAppConfig({ SSL_REJECT_UNAUTHORIZED: 'false' });
    expect(config.rds.sslRejectUnauthorized).toBe(false);
  });

  it('should enable synchronize outside production', () => {
    const config = loadAppConfig({ NODE_ENV: 'development' });
    const synchronize =
      config.nodeEnv !== 'production' && config.nodeEnv !== 'prod';
    expect(synchronize).toBe(true);
  });

  it('should disable synchronize in production', () => {
    const config = loadAppConfig({ NODE_ENV: 'production' });
    const synchronize =
      config.nodeEnv !== 'production' && config.nodeEnv !== 'prod';
    expect(synchronize).toBe(false);
  });
});
