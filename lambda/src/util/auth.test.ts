/**
 * src/util/auth.test.ts
 */
const mockSign = jest.fn();
const mockUpdate = jest.fn();
const mockCreateSign = jest.fn(() => ({
  update: mockUpdate,
  sign: mockSign,
}));

// Mock crypto BEFORE importing the module
jest.mock('crypto', () => ({
  createSign: jest.fn(() => ({
    update: mockUpdate,
    sign: mockSign,
  })),
}));

import {
  decodePrivateKey,
  generateSignature,
  generateAuthHeaders,
} from './auth';
import * as crypto from 'crypto';

describe('Auth module', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    jest.spyOn(Date, 'now').mockReturnValue(1234567890);

    // Mock console.error to silence error logs during tests
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console.error
    consoleErrorSpy.mockRestore();
  });

  describe('decodePrivateKey', () => {
    it('returns undefined when input is undefined', () => {
      const result = decodePrivateKey(undefined);
      expect(result).toBeUndefined();
    });

    it('decodes base64 and normalizes \\n characters', () => {
      const base64Key = Buffer.from('line1\\nline2').toString('base64');
      const result = decodePrivateKey(base64Key);
      expect(result).toBe('line1\nline2');
    });
  });

  describe('generateSignature', () => {
    it('generates a base64 signature successfully', () => {
      mockSign.mockReturnValue('signed-value');
      const result = generateSignature('data-to-sign', 'fake-key');

      expect(result).toBe('signed-value');
      expect(crypto.createSign as jest.Mock).toHaveBeenCalledWith('SHA256');
      expect(mockUpdate).toHaveBeenCalledWith('data-to-sign');
      expect(mockSign).toHaveBeenCalledWith('fake-key', 'base64');
    });

    it('throws descriptive error when signing fails', () => {
      mockSign.mockImplementation(() => {
        throw new Error('signing-failed');
      });

      expect(() => generateSignature('data', 'key')).toThrow(
        'Failed to generate signature: signing-failed',
      );
    });

    it('throws unknown error type when signing throws non-Error', () => {
      mockSign.mockImplementation(() => {
        throw 'random-string-error';
      });

      expect(() => generateSignature('data', 'key')).toThrow(
        'Failed to generate signature: Unknown error',
      );
    });
  });

  describe('generateAuthHeaders', () => {
    it('generates headers successfully with valid private key', () => {
      process.env.LAMBDA_S3_PRIVATE_KEY = Buffer.from('key').toString('base64');
      mockSign.mockReturnValue('valid-signature');

      const result = generateAuthHeaders('POST', '/test', { foo: 'bar' });

      expect(result).toEqual({
        'x-device-id': 'lambda-s3',
        'x-signature': 'valid-signature',
        'x-timestamp': '1234567890',
      });
    });

    it('throws error when private key is missing', () => {
      delete process.env.LAMBDA_S3_PRIVATE_KEY;

      expect(() => generateAuthHeaders('GET', '/path', {})).toThrow(
        'LAMBDA_S3_PRIVATE_KEY environment variable not set',
      );
    });
  });
});
