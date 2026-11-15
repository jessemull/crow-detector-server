import { typeOrmSynchronize } from './app.module';
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

  it('should keep TypeORM from rewriting the schema', () => {
    expect(typeOrmSynchronize).toBe(false);
  });
});
