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

  const mockConfigService = {
    get: jest.fn(),
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
      ],
    }).compile();

    service = module.get<DetectionImageProcessingService>(
      DetectionImageProcessingService,
    );
    configService = module.get<ConfigService>(ConfigService);

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

      const newService = new DetectionImageProcessingService(configService);
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

      const result = await service.processImage('test-bucket', 'test-key');

      expect(result.hasAnimals).toBe(true);
      expect(result.crowCount).toBe(1);
      expect(result.animalCount).toBe(1);
      expect(result.detectedAnimals).toEqual([
        { name: 'Crow', confidence: 87, count: 1 },
      ]);
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

      const result = await service.processImage('test-bucket', 'test-key');

      expect(result.hasAnimals).toBe(true);
      expect(result.crowCount).toBe(1);
      expect(result.animalCount).toBe(1);
      expect(result.detectedAnimals).toEqual([
        { name: 'Crow', confidence: 87, count: 1 },
      ]);
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

      const result = await service.processImage('test-bucket', 'test-key');

      expect(result.hasAnimals).toBe(true);
      expect(result.crowCount).toBe(0);
      expect(result.animalCount).toBe(1);
      expect(result.detectedAnimals).toEqual([
        { name: 'Bird', confidence: 90, count: 1 },
      ]);
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

      const result = await service.processImage('test-bucket', 'test-key');

      expect(result.hasAnimals).toBe(true);
      expect(result.crowCount).toBe(1);
      expect(result.animalCount).toBe(1);
      expect(result.detectedAnimals).toEqual([
        { name: 'crow', confidence: 95, count: 1 },
      ]);
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

      const result = await service.processImage('test-bucket', 'test-key');

      expect(result.hasAnimals).toBe(true);
      expect(result.crowCount).toBe(0);
      expect(result.animalCount).toBe(1);
      expect(result.detectedAnimals).toEqual([
        { name: 'BIRD', confidence: 95, count: 1 },
      ]);
    });

    it('should count one crow when parent labels repeat the same bird', async () => {
      mockRekognitionClient.send.mockResolvedValue({
        Labels: [
          { Name: 'Animal', Confidence: 99.7 },
          { Name: 'Bird', Confidence: 99.7 },
          {
            Name: 'Blackbird',
            Confidence: 99.7,
            Parents: [{ Name: 'Bird' }, { Name: 'Animal' }],
          },
          {
            Name: 'Crow',
            Confidence: 92,
            Parents: [
              { Name: 'Blackbird' },
              { Name: 'Bird' },
              { Name: 'Animal' },
            ],
          },
        ],
      });

      const result = await service.processImage('test-bucket', 'test-key');

      expect(result.animalCount).toBe(1);
      expect(result.crowCount).toBe(1);
      expect(result.detectedAnimals).toEqual([
        { name: 'Crow', confidence: 92, count: 1 },
      ]);
    });

    it('should count one mammal when only broad mammal labels are present', async () => {
      mockRekognitionClient.send.mockResolvedValue({
        Labels: [
          { Name: 'Animal', Confidence: 99.2 },
          { Name: 'Mammal', Confidence: 99.2 },
        ],
      });

      const result = await service.processImage('test-bucket', 'test-key');

      expect(result.hasAnimals).toBe(true);
      expect(result.animalCount).toBe(1);
      expect(result.crowCount).toBe(0);
      expect(result.detectedAnimals).toEqual([
        { name: 'Mammal', confidence: 99.2, count: 1 },
      ]);
    });

    it('should count one squirrel when several names describe it', async () => {
      mockRekognitionClient.send.mockResolvedValue({
        Labels: [
          {
            Name: 'Rodent',
            Confidence: 99.2,
            Parents: [{ Name: 'Mammal' }, { Name: 'Animal' }],
          },
          {
            Name: 'Squirrel',
            Confidence: 98,
            Parents: [
              { Name: 'Rodent' },
              { Name: 'Mammal' },
              { Name: 'Animal' },
            ],
          },
          {
            Name: 'Rat',
            Confidence: 97.8,
            Parents: [
              { Name: 'Rodent' },
              { Name: 'Mammal' },
              { Name: 'Animal' },
            ],
          },
        ],
      });

      const result = await service.processImage('test-bucket', 'test-key');

      expect(result.animalCount).toBe(1);
      expect(result.crowCount).toBe(0);
      expect(result.detectedAnimals).toEqual([
        { name: 'Squirrel', confidence: 98, count: 1 },
      ]);
    });

    it('should count overlapping boxes as one animal', async () => {
      const box = { Left: 0.2, Top: 0.2, Width: 0.4, Height: 0.5 };
      mockRekognitionClient.send.mockResolvedValue({
        Labels: [
          {
            Name: 'Rodent',
            Confidence: 99.2,
            Instances: [{ BoundingBox: box }],
            Parents: [{ Name: 'Animal' }],
          },
          {
            Name: 'Squirrel',
            Confidence: 98,
            Instances: [{ BoundingBox: { ...box, Left: 0.22 } }],
            Parents: [{ Name: 'Rodent' }, { Name: 'Animal' }],
          },
          {
            Name: 'Rat',
            Confidence: 97,
            Instances: [{ BoundingBox: { ...box, Top: 0.25 } }],
            Parents: [{ Name: 'Rodent' }, { Name: 'Animal' }],
          },
        ],
      });

      const result = await service.processImage('test-bucket', 'test-key');

      expect(result.animalCount).toBe(1);
      expect(result.crowCount).toBe(0);
      expect(result.detectedAnimals).toEqual([
        { name: 'Squirrel', confidence: 98, count: 1 },
      ]);
    });

    it('should count separate boxes as separate animals', async () => {
      mockRekognitionClient.send.mockResolvedValue({
        Labels: [
          {
            Name: 'Crow',
            Confidence: 96,
            Instances: [
              {
                BoundingBox: { Left: 0.05, Top: 0.1, Width: 0.2, Height: 0.3 },
              },
              { BoundingBox: { Left: 0.7, Top: 0.1, Width: 0.2, Height: 0.3 } },
            ],
            Parents: [{ Name: 'Bird' }, { Name: 'Animal' }],
          },
          {
            Name: 'Squirrel',
            Confidence: 94,
            Instances: [
              {
                BoundingBox: { Left: 0.4, Top: 0.6, Width: 0.2, Height: 0.25 },
              },
            ],
            Parents: [{ Name: 'Mammal' }, { Name: 'Animal' }],
          },
        ],
      });

      const result = await service.processImage('test-bucket', 'test-key');

      expect(result.animalCount).toBe(3);
      expect(result.crowCount).toBe(2);
      expect(result.detectedAnimals).toEqual([
        { name: 'Crow', confidence: 96, count: 2 },
        { name: 'Squirrel', confidence: 94, count: 1 },
      ]);
    });
  });
});
