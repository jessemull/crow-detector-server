import { DetectionImageProcessingService } from './detection-image-processing.service';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ClaudeService } from './claude.service';
import { createLogger } from '../../common/logger/logger.config';

// Mock AWS SDK clients
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
    // Reset all mocks
    jest.clearAllMocks();

    // Setup AWS client mocks
    (
      RekognitionClient as jest.MockedClass<typeof RekognitionClient>
    ).mockImplementation(() => mockRekognitionClient as any);
    (S3Client as jest.MockedClass<typeof S3Client>).mockImplementation(
      () => mockS3Client as any,
    );

    // Setup logger mock
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
      // Mock Rekognition response with a small delay
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
      // Mock Rekognition response
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
      expect(result.crowCount).toBe(1); // Only "Crow" contains "crow"
      expect(result.animalCount).toBe(2); // Both Bird and Crow are animals
      expect(result.detectedAnimals).toEqual(['Bird', 'Crow']);
    });

    it('should delete image when no animals detected', async () => {
      // Mock Rekognition response with no animals
      const rekognitionResponse = {
        Labels: [
          { Name: 'Tree', Confidence: 95 },
          { Name: 'Landscape', Confidence: 87 },
        ],
      };
      mockRekognitionClient.send.mockResolvedValue(rekognitionResponse);

      // Mock S3 delete operation
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
  });
});
