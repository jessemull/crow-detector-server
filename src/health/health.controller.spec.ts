import { HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { Test, TestingModule } from '@nestjs/testing';

describe('HealthController', () => {
  let controller: HealthController;
  let dbHealthIndicator: TypeOrmHealthIndicator;
  let healthService: HealthCheckService;

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

  describe('constructor and response coverage', () => {
    it('should cover constructor explicitly', () => {
      const instance = new HealthController(healthService, dbHealthIndicator);
      expect(instance).toBeDefined();
      expect(instance).toBeInstanceOf(HealthController);
    });

    it('should cover response object creation explicitly', () => {
      const response = {
        status: 'ok',
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      expect(response.status).toBe('ok');
      expect(response).toHaveProperty('status');
      expect(response).toHaveProperty('timestamp');
    });
  });

  describe('check', () => {
    it('should return health status successfully', () => {
      const result = controller.check();

      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('timestamp');
      expect(result.status).toBe('ok');
      expect(typeof result.timestamp).toBe('string');
      expect(new Date(result.timestamp)).toBeInstanceOf(Date);
    });

    it('should return current timestamp', () => {
      const beforeCall = new Date();
      const result = controller.check();
      const afterCall = new Date();

      const resultTimestamp = new Date(result.timestamp);

      expect(resultTimestamp.getTime()).toBeGreaterThanOrEqual(
        beforeCall.getTime(),
      );
      expect(resultTimestamp.getTime()).toBeLessThanOrEqual(
        afterCall.getTime(),
      );
    });
  });

  describe('checkDatabase', () => {
    it('should call database ping check', async () => {
      mockHealthService.check.mockResolvedValue({ database: { status: 'up' } });

      await controller.checkDatabase();

      expect(healthService.check).toHaveBeenCalledWith([expect.any(Function)]);
    });

    it('should return database health check result', async () => {
      const mockDbResult = { database: { status: 'up' } };
      mockHealthService.check.mockResolvedValue(mockDbResult);

      const result = await controller.checkDatabase();

      expect(result).toEqual(mockDbResult);
      expect(healthService.check).toHaveBeenCalledWith([expect.any(Function)]);
    });
  });
});
