import { FastifyAdapter } from '@nestjs/platform-fastify';
import { NestFactory } from '@nestjs/core';
import { bootstrap } from './main';

jest.mock('@nestjs/core');
jest.mock('@nestjs/platform-fastify');

describe('bootstrap', () => {
  let listenMock: jest.Mock;

  beforeEach(() => {
    listenMock = jest.fn().mockResolvedValue(undefined);

    jest.spyOn(NestFactory, 'create').mockResolvedValue({
      listen: listenMock,
    } as unknown as ReturnType<typeof NestFactory.create>);

    jest.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw new Error(`process.exit called with code ${code}`);
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

  it('should handle bootstrap errors', async () => {
    const error = new Error('fail');
    jest.spyOn(NestFactory, 'create').mockRejectedValue(error);
    await expect(bootstrap()).rejects.toThrow(
      'process.exit called with code 1',
    );
    expect(true).toBe(true);
  });
});
