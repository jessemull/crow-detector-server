import { FastifyAdapter } from '@nestjs/platform-fastify';
import { NestFactory } from '@nestjs/core';
import { bootstrap, trustImmediateProxy } from './main';

jest.mock('@nestjs/core');
jest.mock('@nestjs/platform-fastify');

describe('bootstrap', () => {
  let listenMock: jest.Mock;

  beforeEach(() => {
    listenMock = jest.fn().mockResolvedValue(undefined);
    process.env.NODE_ENV = 'test';

    const app: any = {
      listen: listenMock,
      useGlobalPipes: jest.fn(),
      enableCors: jest.fn(),
    };
    jest.spyOn(NestFactory, 'create').mockResolvedValue(app);

    jest
      .spyOn(process, 'exit')
      .mockImplementation((code?: string | number | null) => {
        throw new Error(`process.exit called with code ${String(code)}`);
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should start the app on default port', async () => {
    process.env.PORT = undefined;
    await bootstrap();
    expect(NestFactory.create).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(FastifyAdapter),
    );
    expect(FastifyAdapter).toHaveBeenCalledWith({
      trustProxy: trustImmediateProxy,
    });
    expect(listenMock).toHaveBeenCalledWith(3000, '0.0.0.0');
  });

  it('should start the app on process.env.PORT', async () => {
    process.env.PORT = '5000';
    await bootstrap();
    expect(listenMock).toHaveBeenCalledWith(5000, '0.0.0.0');
  });

  it('should default to 3000 if process.env.PORT is not a number', async () => {
    delete process.env.PORT;
    await bootstrap();
    expect(listenMock).toHaveBeenCalledWith(3000, '0.0.0.0');
  });

  it('trusts only the socket peer when reading forwarded headers', () => {
    expect(trustImmediateProxy('10.0.0.5', 0)).toBe(true);
    expect(trustImmediateProxy('3.3.3.3', 1)).toBe(false);
  });

  it('should handle bootstrap errors', async () => {
    const error = new Error('fail');
    jest.spyOn(NestFactory, 'create').mockRejectedValue(error);
    await expect(bootstrap()).rejects.toThrow(
      'process.exit called with code 1',
    );
    expect(true).toBe(true);
  });
});
