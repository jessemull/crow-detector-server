import * as crypto from 'crypto';
import { EcdsaAuthGuard } from './ecdsa-auth.guard';
import { Request } from 'express';
import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, ExecutionContext } from '@nestjs/common';

jest.mock('crypto', () => ({
  createVerify: jest.fn(),
}));

jest.mock('src/common/logger/logger.config', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

import { logger } from 'src/common/logger/logger.config';

describe('EcdsaAuthGuard', () => {
  let guard: EcdsaAuthGuard;
  let mockRequest: Partial<Request> & { headers: Record<string, any> };
  let mockContext: ExecutionContext;
  let mockCreateVerify: jest.MockedFunction<any>;

  beforeEach(async () => {
    delete process.env.NODE_ENV;
    delete process.env.PI_MOTION_PUBLIC_KEY;
    delete process.env.PI_FEEDER_PUBLIC_KEY;

    process.env.PI_USER_PUBLIC_KEY = 'test-public-key';

    const module: TestingModule = await Test.createTestingModule({
      providers: [EcdsaAuthGuard],
    }).compile();

    guard = module.get<EcdsaAuthGuard>(EcdsaAuthGuard);

    mockRequest = {
      method: 'POST',
      url: '/detection',
      body: { confidence: 0.85, imageUrl: 'test.jpg' },
      headers: {} as Record<string, any>,
    };

    mockContext = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    } as ExecutionContext;

    mockCreateVerify = crypto.createVerify as jest.MockedFunction<any>;
    mockCreateVerify.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Development mode bypass', () => {
    it('should skip authentication when NODE_ENV is development and x-dev-mode is true', () => {
      process.env.NODE_ENV = 'development';
      mockRequest.headers['x-dev-mode'] = 'true';

      const result = guard.canActivate(mockContext);

      expect(mockRequest['deviceId']).toBe('dev-mode');
      expect(mockRequest['requestTime']).toBeDefined();
      expect(result).toBe(true);
    });

    it('should not skip authentication when NODE_ENV is not development', () => {
      process.env.NODE_ENV = 'production';
      mockRequest.headers['x-dev-mode'] = 'true';

      expect(() => {
        guard.canActivate(mockContext);
      }).toThrow(UnauthorizedException);
    });

    it('should not skip authentication when x-dev-mode is not true', () => {
      process.env.NODE_ENV = 'development';
      mockRequest.headers['x-dev-mode'] = 'false';

      expect(() => {
        guard.canActivate(mockContext);
      }).toThrow(UnauthorizedException);
    });

    it('should not skip authentication when x-dev-mode header is missing', () => {
      process.env.NODE_ENV = 'development';

      expect(() => {
        guard.canActivate(mockContext);
      }).toThrow(UnauthorizedException);
    });
  });

  describe('Header validation', () => {
    it('should throw UnauthorizedException when x-device-id is missing', () => {
      mockRequest.headers['x-signature'] = 'test-signature';
      mockRequest.headers['x-timestamp'] = Date.now().toString();

      expect(() => {
        guard.canActivate(mockContext);
      }).toThrow(
        new UnauthorizedException('Missing required authentication headers'),
      );
    });

    it('should throw UnauthorizedException when x-signature is missing', () => {
      mockRequest.headers['x-device-id'] = 'pi-user';
      mockRequest.headers['x-timestamp'] = Date.now().toString();

      expect(() => {
        guard.canActivate(mockContext);
      }).toThrow(
        new UnauthorizedException('Missing required authentication headers'),
      );
    });

    it('should throw UnauthorizedException when x-timestamp is missing', () => {
      mockRequest.headers['x-device-id'] = 'pi-user';
      mockRequest.headers['x-signature'] = 'test-signature';

      expect(() => {
        guard.canActivate(mockContext);
      }).toThrow(
        new UnauthorizedException('Missing required authentication headers'),
      );
    });

    it('should throw UnauthorizedException when all required headers are missing', () => {
      expect(() => {
        guard.canActivate(mockContext);
      }).toThrow(
        new UnauthorizedException('Missing required authentication headers'),
      );
    });
  });

  describe('Device validation', () => {
    it('should throw UnauthorizedException for unknown device', () => {
      mockRequest.headers['x-device-id'] = 'unknown-device';
      mockRequest.headers['x-signature'] = 'test-signature';
      mockRequest.headers['x-timestamp'] = Date.now().toString();

      expect(() => {
        guard.canActivate(mockContext);
      }).toThrow(new UnauthorizedException('Unknown device'));
    });
  });

  describe('Timestamp validation', () => {
    beforeEach(() => {
      mockRequest.headers['x-device-id'] = 'pi-user';
      mockRequest.headers['x-signature'] = 'test-signature';
    });

    it('should throw UnauthorizedException when timestamp is too old', () => {
      const oldTimestamp = Date.now() - 6 * 60 * 1000;
      mockRequest.headers['x-timestamp'] = oldTimestamp.toString();

      expect(() => {
        guard.canActivate(mockContext);
      }).toThrow(new UnauthorizedException('Request timestamp expired'));
    });

    it('should throw UnauthorizedException when timestamp is too far in the future', () => {
      const futureTimestamp = Date.now() + 6 * 60 * 1000;
      mockRequest.headers['x-timestamp'] = futureTimestamp.toString();

      expect(() => {
        guard.canActivate(mockContext);
      }).toThrow(new UnauthorizedException('Request timestamp expired'));
    });

    it('should accept timestamp within the valid time window', () => {
      const validTimestamp = Date.now() - 2 * 60 * 1000;
      mockRequest.headers['x-timestamp'] = validTimestamp.toString();

      const mockVerifier = {
        update: jest.fn().mockReturnThis(),
        verify: jest.fn().mockReturnValue(true),
      };
      mockCreateVerify.mockReturnValue(mockVerifier as any);

      const result = guard.canActivate(mockContext);

      expect(mockRequest['deviceId']).toBe('pi-user');
      expect(mockRequest['requestTime']).toBe(validTimestamp);
      expect(result).toBe(true);
    });
  });

  describe('Signature verification', () => {
    beforeEach(() => {
      mockRequest.headers['x-device-id'] = 'pi-user';
      mockRequest.headers['x-timestamp'] = Date.now().toString();
    });

    it('should throw UnauthorizedException when signature verification fails', () => {
      mockRequest.headers['x-signature'] = 'invalid-signature';

      const mockVerifier = {
        update: jest.fn().mockReturnThis(),
        verify: jest.fn().mockReturnValue(false),
      };
      mockCreateVerify.mockReturnValue(mockVerifier as any);

      expect(() => {
        guard.canActivate(mockContext);
      }).toThrow(new UnauthorizedException('Invalid signature'));
    });

    it('should proceed when signature verification succeeds', () => {
      mockRequest.headers['x-signature'] = 'valid-signature';

      const mockVerifier = {
        update: jest.fn().mockReturnThis(),
        verify: jest.fn().mockReturnValue(true),
      };
      mockCreateVerify.mockReturnValue(mockVerifier as any);

      const result = guard.canActivate(mockContext);

      expect(mockRequest['deviceId']).toBe('pi-user');
      expect(mockRequest['requestTime']).toBeDefined();
      expect(result).toBe(true);
    });

    it('should handle crypto verification errors gracefully (error is object)', () => {
      mockRequest.headers['x-signature'] = 'test-signature';

      const mockVerifier = {
        update: jest.fn().mockReturnThis(),
        verify: jest.fn().mockImplementation(() => {
          throw new Error('Crypto verification error');
        }),
      };
      mockCreateVerify.mockReturnValue(mockVerifier as any);

      const result = guard['verifySignature']('data', 'sig', 'key');
      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        { error: 'Crypto verification error' },
        'Error verifying signature',
      );
    });

    it('should handle crypto verification errors gracefully (error is string)', () => {
      mockRequest.headers['x-signature'] = 'test-signature';

      (mockCreateVerify as jest.Mock).mockImplementation(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'string error';
      });

      const result = guard['verifySignature']('data', 'sig', 'key');
      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        { error: 'string error' },
        'Error verifying signature',
      );
    });
  });

  describe('Data verification string construction', () => {
    beforeEach(() => {
      mockRequest.headers['x-device-id'] = 'pi-user';
      mockRequest.headers['x-signature'] = 'test-signature';
      mockRequest.headers['x-timestamp'] = Date.now().toString();
    });

    it('should construct verification string correctly', () => {
      const mockVerifier = {
        update: jest.fn().mockReturnThis(),
        verify: jest.fn().mockReturnValue(true),
      };

      mockCreateVerify.mockReturnValue(mockVerifier as any);

      const result = guard.canActivate(mockContext);

      const expectedData = `POST/detection{"confidence":0.85,"imageUrl":"test.jpg"}${mockRequest.headers['x-timestamp']}`;
      expect(mockVerifier.update).toHaveBeenCalledWith(expectedData);
      expect(result).toBe(true);
    });

    it('should handle empty body correctly', () => {
      mockRequest.body = {};
      const mockVerifier = {
        update: jest.fn().mockReturnThis(),
        verify: jest.fn().mockReturnValue(true),
      };

      mockCreateVerify.mockReturnValue(mockVerifier as any);

      const result = guard.canActivate(mockContext);

      const expectedData = `POST/detection{}${mockRequest.headers['x-timestamp']}`;
      expect(mockVerifier.update).toHaveBeenCalledWith(expectedData);
      expect(result).toBe(true);
    });

    it('should handle different HTTP methods', () => {
      const mockRequestWithDifferentMethod = {
        ...mockRequest,
        method: 'PATCH',
        url: '/feed',
      };
      const mockVerifier = {
        update: jest.fn().mockReturnThis(),
        verify: jest.fn().mockReturnValue(true),
      };

      mockCreateVerify.mockReturnValue(mockVerifier as any);

      const result = guard.canActivate({
        switchToHttp: () => ({
          getRequest: () => mockRequestWithDifferentMethod,
        }),
      } as ExecutionContext);

      const expectedData = `PATCH/feed{"confidence":0.85,"imageUrl":"test.jpg"}${mockRequestWithDifferentMethod.headers['x-timestamp']}`;
      expect(mockVerifier.update).toHaveBeenCalledWith(expectedData);
      expect(result).toBe(true);
    });
  });

  describe('Request augmentation', () => {
    beforeEach(() => {
      mockRequest.headers['x-device-id'] = 'pi-user';
      mockRequest.headers['x-signature'] = 'test-signature';
      mockRequest.headers['x-timestamp'] = Date.now().toString();
    });

    it('should add deviceId to request object', () => {
      const mockVerifier = {
        update: jest.fn().mockReturnThis(),
        verify: jest.fn().mockReturnValue(true),
      };

      mockCreateVerify.mockReturnValue(mockVerifier as any);

      const result = guard.canActivate(mockContext);

      expect(mockRequest['deviceId']).toBe('pi-user');
      expect(result).toBe(true);
    });

    it('should add requestTime to request object', () => {
      const mockVerifier = {
        update: jest.fn().mockReturnThis(),
        verify: jest.fn().mockReturnValue(true),
      };

      mockCreateVerify.mockReturnValue(mockVerifier as any);

      const result = guard.canActivate(mockContext);

      expect(mockRequest['requestTime']).toBeDefined();
      expect(typeof mockRequest['requestTime']).toBe('number');
      expect(result).toBe(true);
    });

    it('should return true when authentication succeeds', () => {
      const mockVerifier = {
        update: jest.fn().mockReturnThis(),
        verify: jest.fn().mockReturnValue(true),
      };

      mockCreateVerify.mockReturnValue(mockVerifier as any);

      const result = guard.canActivate(mockContext);

      expect(result).toBe(true);
    });

    it('should set requestTime to the parsed timestamp value', () => {
      const timestamp = Date.now() - 2 * 60 * 1000;
      mockRequest.headers['x-timestamp'] = timestamp.toString();

      const mockVerifier = {
        update: jest.fn().mockReturnThis(),
        verify: jest.fn().mockReturnValue(true),
      };

      mockCreateVerify.mockReturnValue(mockVerifier as any);

      const result = guard.canActivate(mockContext);

      expect(mockRequest['requestTime']).toBe(timestamp);
      expect(result).toBe(true);
    });
  });

  describe('Edge cases and error handling', () => {
    beforeEach(() => {
      mockRequest.headers['x-device-id'] = 'pi-user';
      mockRequest.headers['x-signature'] = 'test-signature';
      mockRequest.headers['x-timestamp'] = Date.now().toString();
    });

    it('should handle request with undefined body by defaulting to empty object', () => {
      mockRequest.body = undefined;

      const mockVerifier = {
        update: jest.fn().mockReturnThis(),
        verify: jest.fn().mockReturnValue(true),
      };
      mockCreateVerify.mockReturnValue(mockVerifier as any);

      const result = guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(mockVerifier.update).toHaveBeenCalledWith(
        expect.stringContaining('{}'),
      );
    });

    it('should handle request with null body by defaulting to empty object', () => {
      mockRequest.body = null;

      const mockVerifier = {
        update: jest.fn().mockReturnThis(),
        verify: jest.fn().mockReturnValue(true),
      };
      mockCreateVerify.mockReturnValue(mockVerifier as any);

      const result = guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(mockVerifier.update).toHaveBeenCalledWith(
        expect.stringContaining('{}'),
      );
    });

    it('should handle verifySignature errors gracefully', () => {
      const mockVerifier = {
        update: jest.fn().mockReturnThis(),
        verify: jest.fn().mockImplementation(() => {
          throw new Error('Crypto verification error');
        }),
      };
      mockCreateVerify.mockReturnValue(mockVerifier as any);

      expect(() => {
        guard.canActivate(mockContext);
      }).toThrow(new UnauthorizedException('Invalid signature'));
    });

    it('should handle signature verification errors gracefully', () => {
      mockCreateVerify.mockImplementation(() => {
        throw new Error('Crypto module error');
      });

      expect(() => {
        guard.canActivate(mockContext);
      }).toThrow(new UnauthorizedException('Invalid signature'));
    });
  });
});
