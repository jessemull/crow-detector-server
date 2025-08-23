import { ClaudeService } from './claude.service';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { createLogger } from '../../common/logger/logger.config';

// Mock the logger
jest.mock('../../common/logger/logger.config');
const mockCreateLogger = createLogger as jest.MockedFunction<
  typeof createLogger
>;

describe('ClaudeService', () => {
  let service: ClaudeService;
  let configService: ConfigService;
  let mockLogger: any;

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();

    // Create a fresh mock logger for each test
    mockLogger = {
      warn: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
    };

    // Setup logger mock
    mockCreateLogger.mockReturnValue(mockLogger);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClaudeService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<ClaudeService>(ClaudeService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create service instance', () => {
      expect(service).toBeDefined();
    });

    it('should warn when API key is missing', () => {
      const freshMockConfigService = {
        get: jest.fn().mockReturnValue(undefined),
      };
      const freshMockLogger = {
        warn: jest.fn(),
        info: jest.fn(),
        error: jest.fn(),
      };
      mockCreateLogger.mockReturnValue(freshMockLogger as any);

      new ClaudeService(freshMockConfigService as any);

      expect(freshMockLogger.warn).toHaveBeenCalledWith(
        'CLAUDE_API_KEY not found in environment variables',
      );
    });

    it('should not warn when API key is present', () => {
      const freshMockConfigService = {
        get: jest.fn().mockReturnValue('test-api-key'),
      };
      const freshMockLogger = {
        warn: jest.fn(),
        info: jest.fn(),
        error: jest.fn(),
      };
      mockCreateLogger.mockReturnValue(freshMockLogger as any);

      new ClaudeService(freshMockConfigService as any);

      expect(freshMockLogger.warn).not.toHaveBeenCalled();
    });
  });

  describe('analyzeAnimalDetection', () => {
    const mockLabels = [
      { Name: 'Bird', Confidence: 95 },
      { Name: 'Crow', Confidence: 87 },
      { Name: 'Tree', Confidence: 92 },
    ];

    it('should throw error when API key is not configured', async () => {
      mockConfigService.get.mockReturnValue(undefined);

      await expect(service.analyzeAnimalDetection(mockLabels)).rejects.toThrow(
        'Claude API key not configured',
      );
    });

    it('should handle missing API key gracefully in constructor', () => {
      mockConfigService.get.mockReturnValue(undefined);

      expect(() => new ClaudeService(configService)).not.toThrow();
    });

    it('should call config service to get API key', () => {
      const freshMockConfigService = {
        get: jest.fn().mockReturnValue('test-api-key'),
      };
      const freshMockLogger = {
        warn: jest.fn(),
        info: jest.fn(),
        error: jest.fn(),
      };
      mockCreateLogger.mockReturnValue(freshMockLogger as any);

      new ClaudeService(freshMockConfigService as any);

      expect(freshMockConfigService.get).toHaveBeenCalledWith('CLAUDE_API_KEY');
    });
  });
});
