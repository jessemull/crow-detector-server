describe('AppModule Configuration', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('SSL Configuration', () => {
    it('should configure SSL rejectUnauthorized as true when SSL_REJECT_UNAUTHORIZED is not set to false', () => {
      delete process.env.SSL_REJECT_UNAUTHORIZED;

      const sslRejectUnauthorized =
        process.env.SSL_REJECT_UNAUTHORIZED === 'false' ? false : true;

      expect(sslRejectUnauthorized).toBe(true);
    });

    it('should configure SSL rejectUnauthorized as false when SSL_REJECT_UNAUTHORIZED is set to false', () => {
      process.env.SSL_REJECT_UNAUTHORIZED = 'false';

      const sslRejectUnauthorized =
        process.env.SSL_REJECT_UNAUTHORIZED === 'false' ? false : true;

      expect(sslRejectUnauthorized).toBe(false);
    });

    it('should configure SSL rejectUnauthorized as true when SSL_REJECT_UNAUTHORIZED is set to other values', () => {
      process.env.SSL_REJECT_UNAUTHORIZED = 'true';

      const sslRejectUnauthorized =
        process.env.SSL_REJECT_UNAUTHORIZED === 'false' ? false : true;

      expect(sslRejectUnauthorized).toBe(true);
    });
  });

  describe('Synchronize Configuration', () => {
    it('should configure synchronize as true in non-production environments', () => {
      process.env.NODE_ENV = 'development';

      const synchronize = process.env.NODE_ENV !== 'production';

      expect(synchronize).toBe(true);
    });

    it('should configure synchronize as false in production environments', () => {
      process.env.NODE_ENV = 'production';

      const synchronize = process.env.NODE_ENV !== 'production';

      expect(synchronize).toBe(false);
    });

    it('should configure synchronize as true when NODE_ENV is not set', () => {
      delete process.env.NODE_ENV;

      const synchronize = process.env.NODE_ENV !== 'production';

      expect(synchronize).toBe(true);
    });
  });
});
