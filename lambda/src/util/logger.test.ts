import { lambdaLogger } from './logger';

describe('lambdaLogger', () => {
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    process.env.NODE_ENV = 'test';
  });

  it('does not log in test environment', () => {
    process.env.NODE_ENV = 'test';
    lambdaLogger.info('hello', { key: 'value' });
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it('emits structured JSON without dumping arbitrary payloads', () => {
    process.env.NODE_ENV = 'production';
    lambdaLogger.info('Processing S3 object', { key: 'feed/a.jpg' });
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const line = JSON.parse(String(consoleLogSpy.mock.calls[0][0]));
    expect(line.message).toBe('Processing S3 object');
    expect(line.key).toBe('feed/a.jpg');
    expect(line.level).toBe('info');
  });
});
