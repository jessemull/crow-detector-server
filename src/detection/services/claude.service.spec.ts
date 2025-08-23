import { ClaudeService } from './claude.service';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { createLogger } from '../../common/logger/logger.config';

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
    jest.clearAllMocks();

    mockLogger = {
      warn: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
    };

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

    beforeEach(() => {
      const mockAnthropic = {
        messages: {
          create: jest.fn(),
        },
      };
      (service as any).anthropic = mockAnthropic;
    });

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

    it('should successfully analyze animal detection with valid response', async () => {
      mockConfigService.get.mockReturnValue('test-api-key');

      const mockResponse = {
        content: [
          {
            type: 'text',
            text: '{"hasAnimals": true, "crowCount": 1, "animalCount": 2, "detectedAnimals": ["Bird", "Crow"]}',
          },
        ],
      };

      (service as any).anthropic.messages.create.mockResolvedValue(
        mockResponse,
      );

      const result = await service.analyzeAnimalDetection(mockLabels);

      expect(result.hasAnimals).toBe(true);
      expect(result.crowCount).toBe(1);
      expect(result.animalCount).toBe(2);
      expect(result.detectedAnimals).toEqual(['Bird', 'Crow']);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Claude analysis completed: 2 animals, 1 crows',
      );
    });

    it('should handle non-text response type from Claude', async () => {
      mockConfigService.get.mockReturnValue('test-api-key');

      const mockResponse = {
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: 'base64data',
            },
          },
        ],
      };

      (service as any).anthropic.messages.create.mockResolvedValue(
        mockResponse,
      );

      await expect(service.analyzeAnimalDetection(mockLabels)).rejects.toThrow(
        'Unexpected response type from Claude',
      );
    });

    it('should handle Claude response with no JSON content', async () => {
      mockConfigService.get.mockReturnValue('test-api-key');

      const mockResponse = {
        content: [
          {
            type: 'text',
            text: 'I cannot analyze this image properly.',
          },
        ],
      };

      (service as any).anthropic.messages.create.mockResolvedValue(
        mockResponse,
      );

      await expect(service.analyzeAnimalDetection(mockLabels)).rejects.toThrow(
        'No JSON found in Claude response',
      );
    });

    it('should handle Claude response with invalid JSON structure', async () => {
      mockConfigService.get.mockReturnValue('test-api-key');

      const mockResponse = {
        content: [
          {
            type: 'text',
            text: '{"hasAnimals": true, "crowCount": "invalid", "animalCount": 2, "detectedAnimals": ["Bird"]}',
          },
        ],
      };

      (service as any).anthropic.messages.create.mockResolvedValue(
        mockResponse,
      );

      await expect(service.analyzeAnimalDetection(mockLabels)).rejects.toThrow(
        'Invalid response structure from Claude',
      );
    });

    it('should handle Claude API errors gracefully', async () => {
      mockConfigService.get.mockReturnValue('test-api-key');

      (service as any).anthropic.messages.create.mockRejectedValue(
        new Error('Claude API rate limit exceeded'),
      );

      await expect(service.analyzeAnimalDetection(mockLabels)).rejects.toThrow(
        'Claude API rate limit exceeded',
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Claude analysis failed: Claude API rate limit exceeded',
        expect.any(String),
      );
    });

    it('should filter out labels without name or confidence', async () => {
      mockConfigService.get.mockReturnValue('test-api-key');

      const incompleteLabels = [
        { Name: 'Bird', Confidence: 95 },
        { Name: 'Crow' },
        { Confidence: 87 },
        { Name: 'Tree', Confidence: 92 },
      ];

      const mockResponse = {
        content: [
          {
            type: 'text',
            text: '{"hasAnimals": true, "crowCount": 1, "animalCount": 1, "detectedAnimals": ["Bird"]}',
          },
        ],
      };

      (service as any).anthropic.messages.create.mockResolvedValue(
        mockResponse,
      );

      const result = await service.analyzeAnimalDetection(incompleteLabels);

      expect(result.hasAnimals).toBe(true);
      expect(result.crowCount).toBe(1);
      expect(result.animalCount).toBe(1);
      expect(result.detectedAnimals).toEqual(['Bird']);
    });
  });
});
