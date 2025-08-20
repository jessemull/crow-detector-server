import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { EcdsaAuthMiddleware } from './ecdsa-auth.middleware';

describe('EcdsaAuthMiddleware', () => {
  let middleware: EcdsaAuthMiddleware;
  let mockRequest: Partial<Request> & { headers: Record<string, any> };
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(async () => {
    // Reset environment variables
    delete process.env.NODE_ENV;
    delete process.env.PI_MOTION_PUBLIC_KEY;
    delete process.env.PI_FEEDER_PUBLIC_KEY;

    // Set the environment variable BEFORE creating the middleware
    process.env.PI_USER_PUBLIC_KEY = 'test-public-key';

    const module: TestingModule = await Test.createTestingModule({
      providers: [EcdsaAuthMiddleware],
    }).compile();

    middleware = module.get<EcdsaAuthMiddleware>(EcdsaAuthMiddleware);

    // Setup mock request
    mockRequest = {
      method: 'POST',
      path: '/detection',
      body: { confidence: 0.85, imageUrl: 'test.jpg' },
      headers: {} as Record<string, any>,
    };

    mockResponse = {};
    mockNext = jest.fn();

    // Clear console.log mocks
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
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
      // No x-dev-mode header

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
      const oldTimestamp = Date.now() - 6 * 60 * 1000; // 6 minutes ago
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
      const futureTimestamp = Date.now() + 6 * 60 * 1000; // 6 minutes in future
      mockRequest.headers['x-timestamp'] = futureTimestamp.toString();

      expect(() => {
        middleware.use(
          mockRequest as Request,
          mockResponse as Response,
          mockNext,
        );
      }).toThrow(new UnauthorizedException('Request timestamp expired'));
    });
  });
});
