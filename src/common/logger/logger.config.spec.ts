import Logger from 'bunyan';

jest.unmock('./logger.config');

jest.mock('bunyan', () => ({
  createLogger: jest.fn(),
  stdSerializers: { req: jest.fn(), res: jest.fn(), err: jest.fn() },
}));

const mockStdout = { write: jest.fn() };
const mockStderr = { write: jest.fn() };

Object.defineProperty(process, 'stdout', {
  value: mockStdout,
  writable: true,
});

Object.defineProperty(process, 'stderr', {
  value: mockStderr,
  writable: true,
});

describe('Logger Configuration', () => {
  let mockCreateLogger: jest.MockedFunction<
    typeof import('bunyan').createLogger
  >;
  let originalEnv: NodeJS.ProcessEnv;
  let loggerModule: any;

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
    } as unknown as Logger);
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
        serializers: jest.requireMock('bunyan').stdSerializers,
        streams: [
          {
            level: 'info',
            stream: process.stdout,
          },
          {
            level: 'error',
            stream: process.stderr,
          },
        ],
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
        serializers: jest.requireMock('bunyan').stdSerializers,
        streams: [
          {
            level: 'info',
            stream: process.stdout,
          },
          {
            level: 'error',
            stream: process.stderr,
          },
        ],
      });
      expect(result).toBeDefined();
    });

    it('should create a logger with different names when called multiple times', () => {
      jest.resetModules();
      mockCreateLogger.mockClear();
      const bunyan = jest.requireMock('bunyan');
      mockCreateLogger = bunyan.createLogger;
      mockCreateLogger.mockReturnValue({
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        trace: jest.fn(),
        fatal: jest.fn(),
      } as unknown as Logger);
      loggerModule = jest.requireActual('./logger.config');
      loggerModule.createLogger('logger-1');
      loggerModule.createLogger('logger-2');
      loggerModule.createLogger('custom-name');
      expect(mockCreateLogger).toHaveBeenCalledTimes(4);
      expect(mockCreateLogger).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ name: 'logger-1' }),
      );
      expect(mockCreateLogger).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({ name: 'logger-2' }),
      );
      expect(mockCreateLogger).toHaveBeenNthCalledWith(
        4,
        expect.objectContaining({ name: 'custom-name' }),
      );
    });

    it('should handle various LOG_LEVEL values', () => {
      const testLevels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
      testLevels.forEach((level) => {
        process.env.LOG_LEVEL = level;
        jest.resetModules();
        mockCreateLogger.mockClear();
        const bunyan = jest.requireMock('bunyan');
        mockCreateLogger = bunyan.createLogger;
        mockCreateLogger.mockReturnValue({
          info: jest.fn(),
          error: jest.fn(),
          warn: jest.fn(),
          debug: jest.fn(),
          trace: jest.fn(),
          fatal: jest.fn(),
        } as unknown as Logger);
        loggerModule = jest.requireActual('./logger.config');
        loggerModule.createLogger('test-logger');
        expect(mockCreateLogger).toHaveBeenCalledWith(
          expect.objectContaining({ level }),
        );
      });
    });

    it('should use bunyan.stdSerializers for serializers', () => {
      loggerModule = jest.requireActual('./logger.config');
      loggerModule.createLogger('test-logger');
      expect(mockCreateLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          serializers: jest.requireMock('bunyan').stdSerializers,
        }),
      );
    });

    it('should configure stdout and stderr streams correctly', () => {
      loggerModule = jest.requireActual('./logger.config');
      loggerModule.createLogger('test-logger');
      expect(mockCreateLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          streams: [
            {
              level: 'info',
              stream: process.stdout,
            },
            {
              level: 'error',
              stream: process.stderr,
            },
          ],
        }),
      );
    });

    it('should handle empty string LOG_LEVEL by defaulting to info', () => {
      process.env.LOG_LEVEL = '';
      loggerModule = jest.requireActual('./logger.config');
      loggerModule.createLogger('test-logger');
      expect(mockCreateLogger).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'info' }),
      );
    });

    it('should handle undefined LOG_LEVEL by defaulting to info', () => {
      delete process.env.LOG_LEVEL;
      loggerModule = jest.requireActual('./logger.config');
      loggerModule.createLogger('test-logger');
      expect(mockCreateLogger).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'info' }),
      );
    });
  });

  describe('default logger instance', () => {
    it('should create a default logger with name "crow-detector-server"', () => {
      loggerModule = jest.requireActual('./logger.config');
      expect(mockCreateLogger).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'crow-detector-server' }),
      );
      expect(loggerModule.logger).toBeDefined();
    });

    it('should create default logger only once when module is imported', () => {
      mockCreateLogger.mockClear();
      jest.requireActual('./logger.config');
      jest.requireActual('./logger.config');
      jest.requireActual('./logger.config');
      expect(mockCreateLogger).toHaveBeenCalledTimes(1);
      expect(mockCreateLogger).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'crow-detector-server' }),
      );
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle null LOG_LEVEL by defaulting to info', () => {
      (process.env as any).LOG_LEVEL = null;
      loggerModule = jest.requireActual('./logger.config');
      loggerModule.createLogger('test-logger');
      expect(mockCreateLogger).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'info' }),
      );
    });

    it('should handle invalid LOG_LEVEL values gracefully', () => {
      const invalidLevels = ['invalid', 'random', 'test', 'xyz'];
      invalidLevels.forEach((level) => {
        process.env.LOG_LEVEL = level;
        jest.resetModules();
        mockCreateLogger.mockClear();
        const bunyan = jest.requireMock('bunyan');
        mockCreateLogger = bunyan.createLogger;
        mockCreateLogger.mockReturnValue({
          info: jest.fn(),
          error: jest.fn(),
          warn: jest.fn(),
          debug: jest.fn(),
          trace: jest.fn(),
          fatal: jest.fn(),
        } as unknown as Logger);
        loggerModule = jest.requireActual('./logger.config');
        loggerModule.createLogger('test-logger');
        expect(mockCreateLogger).toHaveBeenCalledWith(
          expect.objectContaining({ level }),
        );
      });
    });

    it('should preserve all configuration options when creating logger', () => {
      loggerModule = jest.requireActual('./logger.config');
      loggerModule.createLogger('test-logger');
      const callArgs = mockCreateLogger.mock.calls[0][0];
      expect(callArgs).toHaveProperty('name');
      expect(callArgs).toHaveProperty('level');
      expect(callArgs).toHaveProperty('serializers');
      expect(callArgs).toHaveProperty('streams');
      expect(Array.isArray(callArgs.streams)).toBe(true);
      expect(callArgs.streams).toHaveLength(2);
    });
  });
});
