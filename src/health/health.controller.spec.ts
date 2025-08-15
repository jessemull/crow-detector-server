import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';

describe('HealthController', () => {
  let controller: HealthController;
  let healthService: HealthCheckService;
  let dbHealthIndicator: TypeOrmHealthIndicator;

  const mockHealthCheck = {
    database: {
      status: 'up',
    },
  };

  const mockHealthService = {
    check: jest.fn(),
  };

  const mockDbHealthIndicator = {
    pingCheck: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthCheckService,
          useValue: mockHealthService,
        },
        {
          provide: TypeOrmHealthIndicator,
          useValue: mockDbHealthIndicator,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    healthService = module.get<HealthCheckService>(HealthCheckService);
    dbHealthIndicator = module.get<TypeOrmHealthIndicator>(
      TypeOrmHealthIndicator,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('check', () => {
    it('should perform health check successfully', async () => {
      mockHealthService.check.mockResolvedValue(mockHealthCheck);

      const result = await controller.check();

      expect(healthService.check).toHaveBeenCalledWith([expect.any(Function)]);
      expect(result).toEqual(mockHealthCheck);
    });

    it('should call database ping check', async () => {
      mockHealthService.check.mockImplementation(
        async (checks: Array<() => Promise<void>>) => {
          if (Array.isArray(checks)) {
            for (const check of checks) {
              if (typeof check === 'function') {
                await check();
              }
            }
          }
          return mockHealthCheck;
        },
      );

      await controller.check();

      expect(healthService.check).toHaveBeenCalledWith([expect.any(Function)]);

      expect(dbHealthIndicator.pingCheck).toHaveBeenCalledWith('database');
    });

    it('should handle health check errors', async () => {
      const error = new Error('Health check failed');
      mockHealthService.check.mockRejectedValue(error);

      await expect(controller.check()).rejects.toThrow('Health check failed');
      expect(healthService.check).toHaveBeenCalledWith([expect.any(Function)]);
    });
  });
});
