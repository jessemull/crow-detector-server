import { ClaudeService } from './claude.service';
import { ConfigService } from '@nestjs/config';
import { DetectionImageProcessingService } from './detection-image-processing.service';
import { Test, TestingModule } from '@nestjs/testing';
import { createLogger } from '../../common/logger/logger.config';

jest.mock('@aws-sdk/client-rekognition');
jest.mock('@aws-sdk/client-s3');
jest.mock('../../common/logger/logger.config');

import { RekognitionClient } from '@aws-sdk/client-rekognition';
import { S3Client } from '@aws-sdk/client-s3';

const mockRekognitionClient = {
  send: jest.fn(),
};

const mockS3Client = {
  send: jest.fn(),
};

const mockCreateLogger = createLogger as jest.MockedFunction<
  typeof createLogger
>;
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('DetectionImageProcessingService', () => {
  let service: DetectionImageProcessingService;
  let configService: ConfigService;
  let claudeService: ClaudeService;

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockClaudeService = {
    analyzeAnimalDetection: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    (
      RekognitionClient as jest.MockedClass<typeof RekognitionClient>
    ).mockImplementation(() => mockRekognitionClient as any);
    (S3Client as jest.MockedClass<typeof S3Client>).mockImplementation(
      () => mockS3Client as any,
    );

    mockCreateLogger.mockReturnValue(mockLogger as any);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DetectionImageProcessingService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: ClaudeService,
          useValue: mockClaudeService,
        },
      ],
    }).compile();

    service = module.get<DetectionImageProcessingService>(
      DetectionImageProcessingService,
    );
    configService = module.get<ConfigService>(ConfigService);
    claudeService = module.get<ClaudeService>(ClaudeService);

    (service as any).rekognition = mockRekognitionClient;
    (service as any).s3 = mockS3Client;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create service instance', () => {
      expect(service).toBeDefined();
    });

    it('should use default region when AWS_REGION not configured', () => {
      mockConfigService.get.mockReturnValue(undefined);

      const newService = new DetectionImageProcessingService(
        configService,
        claudeService,
      );
      expect(newService).toBeDefined();
    });
  });

  describe('processImage', () => {
    beforeEach(() => {
      mockConfigService.get.mockReturnValue('us-west-2');
    });

    it('should process image successfully with Claude analysis', async () => {
      const rekognitionResponse = {
        Labels: [
          { Name: 'Bird', Confidence: 95 },
          { Name: 'Crow', Confidence: 87 },
        ],
      };
      mockRekognitionClient.send.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve(rekognitionResponse), 10),
          ),
      );

      const claudeResult = {
        hasAnimals: true,
        crowCount: 1,
        animalCount: 1,
        detectedAnimals: ['Crow'],
      };

      mockClaudeService.analyzeAnimalDetection.mockResolvedValue(claudeResult);

      const result = await service.processImage('test-bucket', 'test-key');

      expect(result.hasAnimals).toBe(true);
      expect(result.crowCount).toBe(1);
      expect(result.animalCount).toBe(1);
      expect(result.detectedAnimals).toEqual(['Crow']);
      expect(result.processingDuration).toBeGreaterThan(0);
    });

    it('should fallback to basic detection when Claude fails', async () => {
      const rekognitionResponse = {
        Labels: [
          { Name: 'Bird', Confidence: 95 },
          { Name: 'Crow', Confidence: 87 },
        ],
      };
      mockRekognitionClient.send.mockResolvedValue(rekognitionResponse);

      mockClaudeService.analyzeAnimalDetection.mockRejectedValue(
        new Error('Claude API error'),
      );

      const result = await service.processImage('test-bucket', 'test-key');

      expect(result.hasAnimals).toBe(true);
      expect(result.crowCount).toBe(1);
      expect(result.animalCount).toBe(2);
      expect(result.detectedAnimals).toEqual(['Bird', 'Crow']);
    });

    it('should delete image when no animals detected', async () => {
      const rekognitionResponse = {
        Labels: [
          { Name: 'Tree', Confidence: 95 },
          { Name: 'Landscape', Confidence: 87 },
        ],
      };
      mockRekognitionClient.send.mockResolvedValue(rekognitionResponse);

      mockS3Client.send.mockResolvedValue({});

      const claudeResult = {
        hasAnimals: false,
        crowCount: 0,
        animalCount: 0,
        detectedAnimals: [],
      };

      mockClaudeService.analyzeAnimalDetection.mockResolvedValue(claudeResult);

      const result = await service.processImage('test-bucket', 'test-key');

      expect(result.hasAnimals).toBe(false);
      expect(result.crowCount).toBe(0);
      expect(result.animalCount).toBe(0);
      expect(mockS3Client.send).toHaveBeenCalledTimes(1);
    });

    it('should handle AWS Rekognition errors gracefully', async () => {
      mockRekognitionClient.send.mockRejectedValue(
        new Error('AWS Rekognition service unavailable'),
      );

      await expect(
        service.processImage('test-bucket', 'test-key'),
      ).rejects.toThrow('AWS Rekognition service unavailable');
    });

    it('should handle S3 delete errors gracefully', async () => {
      const rekognitionResponse = {
        Labels: [{ Name: 'Tree', Confidence: 95 }],
      };
      mockRekognitionClient.send.mockResolvedValue(rekognitionResponse);

      const claudeResult = {
        hasAnimals: false,
        crowCount: 0,
        animalCount: 0,
        detectedAnimals: [],
      };

      mockClaudeService.analyzeAnimalDetection.mockResolvedValue(claudeResult);

      mockS3Client.send.mockRejectedValue(
        new Error('S3 delete operation failed'),
      );

      await expect(
        service.processImage('test-bucket', 'test-key'),
      ).rejects.toThrow('S3 delete operation failed');
    });

    it('should handle empty labels array from Rekognition', async () => {
      const rekognitionResponse = {
        Labels: [],
      };
      mockRekognitionClient.send.mockResolvedValue(rekognitionResponse);

      const claudeResult = {
        hasAnimals: false,
        crowCount: 0,
        animalCount: 0,
        detectedAnimals: [],
      };

      mockClaudeService.analyzeAnimalDetection.mockResolvedValue(claudeResult);

      mockS3Client.send.mockResolvedValue({});

      const result = await service.processImage('test-bucket', 'test-key');

      expect(result.hasAnimals).toBe(false);
      expect(result.crowCount).toBe(0);
      expect(result.animalCount).toBe(0);
      expect(result.detectedAnimals).toEqual([]);
    });

    it('should handle undefined labels from Rekognition', async () => {
      const rekognitionResponse = {};
      mockRekognitionClient.send.mockResolvedValue(rekognitionResponse);

      const claudeResult = {
        hasAnimals: false,
        crowCount: 0,
        animalCount: 0,
        detectedAnimals: [],
      };

      mockClaudeService.analyzeAnimalDetection.mockResolvedValue(claudeResult);

      mockS3Client.send.mockResolvedValue({});

      const result = await service.processImage('test-bucket', 'test-key');

      expect(result.hasAnimals).toBe(false);
      expect(result.crowCount).toBe(0);
      expect(result.animalCount).toBe(0);
      expect(result.detectedAnimals).toEqual([]);
    });

    it('should handle fallback detection with various animal types', async () => {
      const rekognitionResponse = {
        Labels: [
          { Name: 'Animal', Confidence: 95 },
          { Name: 'Wildlife', Confidence: 87 },
          { Name: 'Pet', Confidence: 92 },
          { Name: 'Farm Animal', Confidence: 88 },
          { Name: 'Bird', Confidence: 90 },
          { Name: 'Avian', Confidence: 85 },
          { Name: 'Mammal', Confidence: 89 },
          { Name: 'Furry Animal', Confidence: 86 },
        ],
      };
      mockRekognitionClient.send.mockResolvedValue(rekognitionResponse);

      mockClaudeService.analyzeAnimalDetection.mockRejectedValue(
        new Error('Claude API error'),
      );

      const result = await service.processImage('test-bucket', 'test-key');

      expect(result.hasAnimals).toBe(true);
      expect(result.animalCount).toBe(8);
      expect(result.detectedAnimals).toContain('Animal');
      expect(result.detectedAnimals).toContain('Wildlife');
      expect(result.detectedAnimals).toContain('Pet');
      expect(result.detectedAnimals).toContain('Farm Animal');
      expect(result.detectedAnimals).toContain('Bird');
      expect(result.detectedAnimals).toContain('Avian');
      expect(result.detectedAnimals).toContain('Mammal');
      expect(result.detectedAnimals).toContain('Furry Animal');
    });

    it('should handle fallback detection with crow-specific terms', async () => {
      const rekognitionResponse = {
        Labels: [
          { Name: 'crow', Confidence: 95 },
          { Name: 'raven', Confidence: 87 },
          { Name: 'blackbird', Confidence: 92 },
          { Name: 'corvid', Confidence: 88 },
        ],
      };
      mockRekognitionClient.send.mockResolvedValue(rekognitionResponse);

      mockClaudeService.analyzeAnimalDetection.mockRejectedValue(
        new Error('Claude API error'),
      );

      const result = await service.processImage('test-bucket', 'test-key');

      expect(result.hasAnimals).toBe(true);
      expect(result.crowCount).toBe(4);
      expect(result.animalCount).toBe(4);
      expect(result.detectedAnimals).toContain('crow');
      expect(result.detectedAnimals).toContain('raven');
      expect(result.detectedAnimals).toContain('blackbird');
      expect(result.detectedAnimals).toContain('corvid');
    });

    it('should handle fallback detection with mixed case labels', async () => {
      const rekognitionResponse = {
        Labels: [
          { Name: 'BIRD', Confidence: 95 },
          { Name: 'Mammal', Confidence: 87 },
          { Name: 'wildlife', Confidence: 92 },
        ],
      };
      mockRekognitionClient.send.mockResolvedValue(rekognitionResponse);

      mockClaudeService.analyzeAnimalDetection.mockRejectedValue(
        new Error('Claude API error'),
      );

      const result = await service.processImage('test-bucket', 'test-key');

      expect(result.hasAnimals).toBe(true);
      expect(result.animalCount).toBe(3);
      expect(result.detectedAnimals).toContain('BIRD');
      expect(result.detectedAnimals).toContain('Mammal');
      expect(result.detectedAnimals).toContain('wildlife');
    });
  });
});
