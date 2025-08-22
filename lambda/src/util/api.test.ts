import { API_TIMEOUT_MS } from '../constants';
import { S3ObjectInfo } from '../types';
import { callAPI } from './api';

jest.mock('./auth', () => ({
  generateAuthHeaders: jest.fn(() => ({
    'x-device-id': 'test-device',
    'x-signature': 'test-signature',
    'x-timestamp': '1234567890',
  })),
}));

jest.mock('./images', () => ({
  getImageType: jest.fn(() => 'detection'),
}));

describe('callAPI', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('aborts the request when timeout triggers', async () => {
    const abortSpy = jest.fn();
    const mockAbortController = {
      signal: {},
      abort: abortSpy,
    } as unknown as AbortController;

    jest
      .spyOn(global, 'AbortController')
      .mockImplementation(() => mockAbortController);

    global.fetch = jest.fn(
      () => new Promise(() => {}),
    ) as unknown as typeof fetch;

    callAPI({ bucket: 'bucket', key: 'file.jpg' } as unknown as S3ObjectInfo);

    jest.advanceTimersByTime(API_TIMEOUT_MS + 1);

    await Promise.resolve();

    expect(abortSpy).toHaveBeenCalled();

    jest.spyOn(global, 'AbortController').mockRestore();
  });
});
