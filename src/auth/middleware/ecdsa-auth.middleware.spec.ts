import * as crypto from 'crypto';
import { EcdsaAuthMiddleware } from './ecdsa-auth.middleware';
import { Request, Response, NextFunction } from 'express';
import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';

jest.mock('crypto', () => ({
  createVerify: jest.fn(),
}));

describe('EcdsaAuthMiddleware', () => {
  let middleware: EcdsaAuthMiddleware;
  let mockRequest: Partial<Request> & { headers: Record<string, any> };
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let mockCreateVerify: jest.MockedFunction<any>;

  beforeEach(async () => {
    delete process.env.NODE_ENV;
    delete process.env.PI_MOTION_PUBLIC_KEY;
    delete process.env.PI_FEEDER_PUBLIC_KEY;

    process.env.PI_USER_PUBLIC_KEY = 'test-public-key';

    const module: TestingModule = await Test.createTestingModule({
      providers: [EcdsaAuthMiddleware],
    }).compile();

    middleware = module.get<EcdsaAuthMiddleware>(EcdsaAuthMiddleware);

    mockRequest = {
      method: 'POST',
      path: '/detection',
      body: { confidence: 0.85, imageUrl: 'test.jpg' },
      headers: {} as Record<string, any>,
    };

    mockResponse = {};
    mockNext = jest.fn();

    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();

    mockCreateVerify = crypto.createVerify as jest.MockedFunction<any>;
    mockCreateVerify.mockReset();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Development mode bypass', () => {
    it('should skip authentication when NODE_ENV is development and x-dev-mode is true', () => {
      process.env.NODE_ENV = 'development';
      mockRequest.headers['x-dev-mode'] = 'true';

      middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        mockNext,
      );

      expect(mockRequest['deviceId']).toBe('dev-mode');
      expect(mockRequest['requestTime']).toBeDefined();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should not skip authentication when NODE_ENV is not development', () => {
      process.env.NODE_ENV = 'production';
      mockRequest.headers['x-dev-mode'] = 'true';

      expect(() => {
        middleware.use(
          mockRequest as Request,
          mockResponse as Response,
          mockNext,
        );
      }).toThrow(UnauthorizedException);
    });

    it('should not skip authentication when x-dev-mode is not true', () => {
      process.env.NODE_ENV = 'development';
      mockRequest.headers['x-dev-mode'] = 'false';

      expect(() => {
        middleware.use(
          mockRequest as Request,
          mockResponse as Response,
          mockNext,
        );
      }).toThrow(UnauthorizedException);
    });

    it('should not skip authentication when x-dev-mode header is missing', () => {
      process.env.NODE_ENV = 'development';

      expect(() => {
        middleware.use(
          mockRequest as Request,
          mockResponse as Response,
          mockNext,
        );
      }).toThrow(UnauthorizedException);
    });
  });

  describe('Header validation', () => {
    it('should throw UnauthorizedException when x-device-id is missing', () => {
      mockRequest.headers['x-signature'] = 'test-signature';
      mockRequest.headers['x-timestamp'] = Date.now().toString();

      expect(() => {
        middleware.use(
          mockRequest as Request,
          mockResponse as Response,
          mockNext,
        );
      }).toThrow(
        new UnauthorizedException('Missing required authentication headers'),
      );
    });

    it('should throw UnauthorizedException when x-signature is missing', () => {
      mockRequest.headers['x-device-id'] = 'pi-user';
      mockRequest.headers['x-timestamp'] = Date.now().toString();

      expect(() => {
        middleware.use(
          mockRequest as Request,
          mockResponse as Response,
          mockNext,
        );
      }).toThrow(
        new UnauthorizedException('Missing required authentication headers'),
      );
    });

    it('should throw UnauthorizedException when x-timestamp is missing', () => {
      mockRequest.headers['x-device-id'] = 'pi-user';
      mockRequest.headers['x-signature'] = 'test-signature';

      expect(() => {
        middleware.use(
          mockRequest as Request,
          mockResponse as Response,
          mockNext,
        );
      }).toThrow(
        new UnauthorizedException('Missing required authentication headers'),
      );
    });

    it('should throw UnauthorizedException when all required headers are missing', () => {
      expect(() => {
        middleware.use(
          mockRequest as Request,
          mockResponse as Response,
          mockNext,
        );
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
        middleware.use(
          mockRequest as Request,
          mockResponse as Response,
          mockNext,
        );
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
        middleware.use(
          mockRequest as Request,
          mockResponse as Response,
          mockNext,
        );
      }).toThrow(new UnauthorizedException('Request timestamp expired'));
    });

    it('should throw UnauthorizedException when timestamp is too far in the future', () => {
      const futureTimestamp = Date.now() + 6 * 60 * 1000;
      mockRequest.headers['x-timestamp'] = futureTimestamp.toString();

      expect(() => {
        middleware.use(
          mockRequest as Request,
          mockResponse as Response,
          mockNext,
        );
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

      middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        mockNext,
      );

      expect(mockRequest['deviceId']).toBe('pi-user');
      expect(mockRequest['requestTime']).toBe(validTimestamp);
      expect(mockNext).toHaveBeenCalled();
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
        middleware.use(
          mockRequest as Request,
          mockResponse as Response,
          mockNext,
        );
      }).toThrow(new UnauthorizedException('Invalid signature'));
    });

    it('should proceed when signature verification succeeds', () => {
      mockRequest.headers['x-signature'] = 'valid-signature';

      const mockVerifier = {
        update: jest.fn().mockReturnThis(),
        verify: jest.fn().mockReturnValue(true),
      };
      mockCreateVerify.mockReturnValue(mockVerifier as any);

      middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        mockNext,
      );

      expect(mockRequest['deviceId']).toBe('pi-user');
      expect(mockRequest['requestTime']).toBeDefined();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle crypto verification errors gracefully', () => {
      mockRequest.headers['x-signature'] = 'test-signature';

      mockCreateVerify.mockImplementation(() => {
        throw new Error('Crypto error');
      });

      expect(() => {
        middleware.use(
          mockRequest as Request,
          mockResponse as Response,
          mockNext,
        );
      }).toThrow(new UnauthorizedException('Invalid signature'));
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

      middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        mockNext,
      );

      const expectedData = `POST/detection{"confidence":0.85,"imageUrl":"test.jpg"}${mockRequest.headers['x-timestamp']}`;
      expect(mockVerifier.update).toHaveBeenCalledWith(expectedData);
    });

    it('should handle empty body correctly', () => {
      mockRequest.body = {};
      const mockVerifier = {
        update: jest.fn().mockReturnThis(),
        verify: jest.fn().mockReturnValue(true),
      };

      mockCreateVerify.mockReturnValue(mockVerifier as any);

      middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        mockNext,
      );

      const expectedData = `POST/detection{}${mockRequest.headers['x-timestamp']}`;
      expect(mockVerifier.update).toHaveBeenCalledWith(expectedData);
    });

    it('should handle different HTTP methods', () => {
      const mockRequestWithDifferentMethod = {
        ...mockRequest,
        method: 'PATCH',
        path: '/feed',
      };
      const mockVerifier = {
        update: jest.fn().mockReturnThis(),
        verify: jest.fn().mockReturnValue(true),
      };

      mockCreateVerify.mockReturnValue(mockVerifier as any);

      middleware.use(
        mockRequestWithDifferentMethod as Request,
        mockResponse as Response,
        mockNext,
      );

      const expectedData = `PATCH/feed{"confidence":0.85,"imageUrl":"test.jpg"}${mockRequestWithDifferentMethod.headers['x-timestamp']}`;
      expect(mockVerifier.update).toHaveBeenCalledWith(expectedData);
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

      middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        mockNext,
      );

      expect(mockRequest['deviceId']).toBe('pi-user');
    });

    it('should add requestTime to request object', () => {
      const mockVerifier = {
        update: jest.fn().mockReturnThis(),
        verify: jest.fn().mockReturnValue(true),
      };

      mockCreateVerify.mockReturnValue(mockVerifier as any);

      middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        mockNext,
      );

      expect(mockRequest['requestTime']).toBeDefined();
      expect(typeof mockRequest['requestTime']).toBe('number');
    });

    it('should call next() function', () => {
      const mockVerifier = {
        update: jest.fn().mockReturnThis(),
        verify: jest.fn().mockReturnValue(true),
      };

      mockCreateVerify.mockReturnValue(mockVerifier as any);

      middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalled();
    });

    it('should set requestTime to the parsed timestamp value', () => {
      const timestamp = Date.now() - 2 * 60 * 1000;
      mockRequest.headers['x-timestamp'] = timestamp.toString();

      const mockVerifier = {
        update: jest.fn().mockReturnThis(),
        verify: jest.fn().mockReturnValue(true),
      };

      mockCreateVerify.mockReturnValue(mockVerifier as any);

      middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        mockNext,
      );

      expect(mockRequest['requestTime']).toBe(timestamp);
    });
  });
});
