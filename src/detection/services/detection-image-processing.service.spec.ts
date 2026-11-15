import { ConfigService } from '@nestjs/config';
import { DetectionImageProcessingService } from './detection-image-processing.service';
import { ClaudeService } from './claude.service';
import { Test, TestingModule } from '@nestjs/testing';
import { createLogger } from '../../common/logger/logger.config';

jest.mock('@aws-sdk/client-s3');
jest.mock('../../common/logger/logger.config');

import {
  DeleteObjectCommand,
  GetObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

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
  const mockClaudeService = {
    analyzeAnimalPhoto: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  const imageBytes = new Uint8Array([1, 2, 3]);

  beforeEach(async () => {
    jest.clearAllMocks();
    (S3Client as jest.MockedClass<typeof S3Client>).mockImplementation(
      () => mockS3Client as any,
    );
    mockCreateLogger.mockReturnValue(mockLogger as any);
    mockS3Client.send.mockResolvedValue({
      Body: {
        transformToByteArray: () => Promise.resolve(imageBytes),
      },
    });

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
    (service as any).s3 = mockS3Client;
  });

  describe('constructor', () => {
    it('should create service instance', () => {
      expect(service).toBeDefined();
    });

    it('should use default region when AWS_REGION not configured', () => {
      mockConfigService.get.mockReturnValue(undefined);

      const newService = new DetectionImageProcessingService(
        configService,
        mockClaudeService as unknown as ClaudeService,
      );
      expect(newService).toBeDefined();
    });
  });

  describe('processImage', () => {
    beforeEach(() => {
      mockConfigService.get.mockReturnValue('us-west-2');
    });

    it('should return the animals Haiku saw and keep the photo', async () => {
      mockClaudeService.analyzeAnimalPhoto.mockResolvedValue({
        hasAnimals: true,
        crowCount: 0,
        animalCount: 2,
        detectedAnimals: [
          { name: 'Raccoon', confidence: 90, count: 1 },
          { name: 'Cat', confidence: 88, count: 1 },
        ],
      });

      const result = await service.processImage(
        'bucket',
        'detection/photo.jpg',
      );

      expect(mockS3Client.send).toHaveBeenCalledWith(
        expect.any(GetObjectCommand),
      );
      expect(mockClaudeService.analyzeAnimalPhoto).toHaveBeenCalledWith(
        Buffer.from(imageBytes),
        'image/jpeg',
      );
      expect(result.animalCount).toBe(2);
      expect(result.crowCount).toBe(0);
      expect(result.detectedAnimals).toEqual([
        { name: 'Raccoon', confidence: 90, count: 1 },
        { name: 'Cat', confidence: 88, count: 1 },
      ]);
      expect(result.processingDuration).toEqual(expect.any(Number));
      expect(mockS3Client.send).not.toHaveBeenCalledWith(
        expect.any(DeleteObjectCommand),
      );
    });

    it.each([
      ['detection/photo.PNG', 'image/png'],
      ['detection/photo.gif', 'image/gif'],
      ['detection/photo.webp', 'image/webp'],
    ])('should send %s as %s', async (key, mediaType) => {
      mockClaudeService.analyzeAnimalPhoto.mockResolvedValue({
        hasAnimals: true,
        crowCount: 1,
        animalCount: 1,
        detectedAnimals: [{ name: 'Crow', confidence: 95, count: 1 }],
      });

      await service.processImage('bucket', key);

      expect(mockClaudeService.analyzeAnimalPhoto).toHaveBeenCalledWith(
        Buffer.from(imageBytes),
        mediaType,
      );
    });

    it('should delete the photo when Haiku sees no living animal', async () => {
      mockClaudeService.analyzeAnimalPhoto.mockResolvedValue({
        hasAnimals: false,
        crowCount: 0,
        animalCount: 0,
        detectedAnimals: [],
      });

      const result = await service.processImage('bucket', 'detection/mug.jpg');

      expect(result.hasAnimals).toBe(false);
      expect(mockS3Client.send).toHaveBeenCalledWith(
        expect.any(DeleteObjectCommand),
      );
    });

    it('should fail when the image body is empty', async () => {
      mockS3Client.send.mockResolvedValue({});

      await expect(
        service.processImage('bucket', 'detection/photo.jpg'),
      ).rejects.toThrow('Image body was empty');
      expect(mockClaudeService.analyzeAnimalPhoto).not.toHaveBeenCalled();
    });

    it('should fail when the photo cannot be read', async () => {
      mockS3Client.send.mockRejectedValue(new Error('S3 unavailable'));

      await expect(
        service.processImage('bucket', 'detection/photo.jpg'),
      ).rejects.toThrow('S3 unavailable');
    });

    it('should fail when Haiku fails', async () => {
      mockClaudeService.analyzeAnimalPhoto.mockRejectedValue(
        new Error('Claude API rate limit exceeded'),
      );

      await expect(
        service.processImage('bucket', 'detection/photo.jpg'),
      ).rejects.toThrow('Claude API rate limit exceeded');
    });

    it('should fail when a rejected photo cannot be deleted', async () => {
      mockClaudeService.analyzeAnimalPhoto.mockResolvedValue({
        hasAnimals: false,
        crowCount: 0,
        animalCount: 0,
        detectedAnimals: [],
      });
      mockS3Client.send
        .mockResolvedValueOnce({
          Body: { transformToByteArray: () => Promise.resolve(imageBytes) },
        })
        .mockRejectedValueOnce(new Error('Delete failed'));

      await expect(
        service.processImage('bucket', 'detection/mug.jpg'),
      ).rejects.toThrow('Delete failed');
    });
  });
});
