import Logger from 'bunyan';

jest.unmock('./logger.config');

jest.mock('bunyan', () => ({
  createLogger: jest.fn(),
}));

describe('Logger Configuration', () => {
  let mockCreateLogger: jest.MockedFunction<
    typeof import('bunyan').createLogger
  >;
  let originalEnv: NodeJS.ProcessEnv;
  let loggerModule: {
    createLogger: (name: string) => Logger;
    logger: Logger;
  };

  beforeEach(() => {
    originalEnv = { ...process.env };
    jest.clearAllMocks();
    jest.resetModules();
    const bunyan = jest.requireMock('bunyan');
    mockCreateLogger = bunyan.createLogger;
    mockCreateLogger.mockClear();
    mockCreateLogger.mockReturnValue({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      trace: jest.fn(),
      fatal: jest.fn(),
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('createLogger', () => {
    it('should create a logger with default configuration when LOG_LEVEL is not set', () => {
      delete process.env.LOG_LEVEL;
      loggerModule = jest.requireActual('./logger.config');
      const result = loggerModule.createLogger('test-logger');
      expect(mockCreateLogger).toHaveBeenCalledWith({
        name: 'test-logger',
        level: 'info',
      });
      expect(result).toBeDefined();
    });

    it('should create a logger with custom LOG_LEVEL when environment variable is set', () => {
      process.env.LOG_LEVEL = 'debug';
      loggerModule = jest.requireActual('./logger.config');
      const result = loggerModule.createLogger('test-logger');
      expect(mockCreateLogger).toHaveBeenCalledWith({
        name: 'test-logger',
        level: 'debug',
      });
      expect(result).toBeDefined();
    });
  });

  describe('default logger instance', () => {
    it('should export a default logger named crow-detector', () => {
      loggerModule = jest.requireActual('./logger.config');
      expect(loggerModule.logger).toBeDefined();
      expect(mockCreateLogger).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'crow-detector' }),
      );
    });
  });
});
