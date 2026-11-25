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
  let mockLogger: any;

  const mockConfigService = {
    get: jest.fn(),
  };

  const photo = Buffer.from('photo');

  const jsonResponse = (body: unknown) => ({
    content: [{ type: 'text', text: JSON.stringify(body) }],
  });

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

  describe('analyzeAnimalPhoto', () => {
    beforeEach(() => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'claudeApiKey') {
          return 'test-api-key';
        }
        if (key === 'claudeModel') {
          return 'claude-haiku-5-5';
        }
        return undefined;
      });
      (service as any).anthropic = {
        messages: { create: jest.fn() },
      };
    });

    it('should throw error when API key is not configured', async () => {
      mockConfigService.get.mockReturnValue(undefined);

      await expect(
        service.analyzeAnimalPhoto(photo, 'image/jpeg'),
      ).rejects.toThrow('Claude API key not configured');
    });

    it('should send the photo to Haiku and return the animals', async () => {
      (service as any).anthropic.messages.create.mockResolvedValue(
        jsonResponse({
          hasAnimals: true,
          crowCount: 0,
          animalCount: 2,
          detectedAnimals: [
            { name: 'Raccoon', confidence: 92, count: 1 },
            { name: 'Cat', confidence: 90, count: 1 },
          ],
        }),
      );

      const result = await service.analyzeAnimalPhoto(photo, 'image/jpeg');

      const request = (service as any).anthropic.messages.create.mock
        .calls[0][0];
      expect(request.model).toBe('claude-haiku-5-5');
      expect(request.temperature).toBeUndefined();
      expect(request.messages[0].content[0]).toEqual({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: photo.toString('base64'),
        },
      });
      expect(request.messages[0].content[1].text).toContain(
        'A raccoon and a cat are two animals',
      );
      expect(request.messages[0].content[1].text).toContain('not a crow');
      expect(result).toEqual({
        hasAnimals: true,
        crowCount: 0,
        animalCount: 2,
        detectedAnimals: [
          { name: 'Raccoon', confidence: 92, count: 1 },
          { name: 'Cat', confidence: 90, count: 1 },
        ],
      });
    });

    it('should not count a squirrel as a crow when the count field says one', async () => {
      (service as any).anthropic.messages.create.mockResolvedValue(
        jsonResponse({
          hasAnimals: true,
          crowCount: 1,
          animalCount: 1,
          detectedAnimals: [{ name: 'Squirrel', confidence: 98, count: 1 }],
        }),
      );

      const result = await service.analyzeAnimalPhoto(photo, 'image/jpeg');

      expect(result.crowCount).toBe(0);
      expect(result.animalCount).toBe(1);
      expect(result.detectedAnimals[0].name).toBe('Squirrel');
    });

    it('should count a blackbird as a crow when the count field is left at zero', async () => {
      (service as any).anthropic.messages.create.mockResolvedValue(
        jsonResponse({
          hasAnimals: true,
          crowCount: 0,
          animalCount: 1,
          detectedAnimals: [{ name: 'Blackbird', confidence: 80, count: 1 }],
        }),
      );

      const result = await service.analyzeAnimalPhoto(photo, 'image/jpeg');

      expect(result.crowCount).toBe(1);
      expect(result.animalCount).toBe(1);
    });

    it('should treat an empty animal list as no animals', async () => {
      (service as any).anthropic.messages.create.mockResolvedValue(
        jsonResponse({
          hasAnimals: true,
          crowCount: 1,
          animalCount: 1,
          detectedAnimals: [],
        }),
      );

      const result = await service.analyzeAnimalPhoto(photo, 'image/jpeg');

      expect(result.hasAnimals).toBe(false);
      expect(result.animalCount).toBe(0);
      expect(result.crowCount).toBe(0);
    });

    it('should handle non-text response type from Claude', async () => {
      (service as any).anthropic.messages.create.mockResolvedValue({
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
      });

      await expect(
        service.analyzeAnimalPhoto(photo, 'image/jpeg'),
      ).rejects.toThrow('Unexpected response type from Claude');
    });

    it('should handle Claude response with no JSON content', async () => {
      (service as any).anthropic.messages.create.mockResolvedValue({
        content: [
          { type: 'text', text: 'I cannot analyze this image properly.' },
        ],
      });

      await expect(
        service.analyzeAnimalPhoto(photo, 'image/jpeg'),
      ).rejects.toThrow('No JSON found in Claude response');
    });

    it('should handle Claude response with invalid JSON structure', async () => {
      (service as any).anthropic.messages.create.mockResolvedValue(
        jsonResponse({
          hasAnimals: true,
          crowCount: 'invalid',
          animalCount: 2,
          detectedAnimals: ['Bird'],
        }),
      );

      await expect(
        service.analyzeAnimalPhoto(photo, 'image/jpeg'),
      ).rejects.toThrow('Invalid response structure from Claude');
    });

    it('should handle Claude API errors gracefully', async () => {
      (service as any).anthropic.messages.create.mockRejectedValue(
        new Error('Claude API rate limit exceeded'),
      );

      await expect(
        service.analyzeAnimalPhoto(photo, 'image/jpeg'),
      ).rejects.toThrow('Claude API rate limit exceeded');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Claude analysis failed: Claude API rate limit exceeded',
      );
    });
  });
});
