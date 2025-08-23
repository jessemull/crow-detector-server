import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { S3MetadataService } from './s3-metadata.service';
import { Source } from 'src/common/types';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';

jest.mock('@aws-sdk/client-s3');

describe('S3MetadataService', () => {
  let service: S3MetadataService;
  let configService: ConfigService;
  let mockS3Send: jest.Mock;

  beforeEach(async () => {
    mockS3Send = jest.fn();

    (S3Client as jest.Mock).mockImplementation(() => ({
      send: mockS3Send,
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        S3MetadataService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => {
              if (key === 'AWS_REGION') return 'us-west-2';
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<S3MetadataService>(S3MetadataService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize S3 service with correct configuration', () => {
      expect(S3Client).toHaveBeenCalledWith({
        region: 'us-west-2',
      });
      expect(configService.get).toHaveBeenCalledWith('AWS_REGION');
    });
  });

  describe('extractMetadataFromUrl', () => {
    const validUrl =
      'https://test-bucket.s3.us-west-2.amazonaws.com/feed/1234567890-test-image.jpg';

    beforeEach(() => {
      mockS3Send.mockResolvedValue({
        ContentLength: 1024,
        Metadata: {
          'x-amz-meta-source': 'API',
          'x-amz-meta-timestamp': '1234567890',
          'x-amz-meta-type': 'feed',
        },
      });
    });

    it('should extract metadata from valid S3 URL', async () => {
      const result = await service.extractMetadataFromUrl(validUrl);

      expect(result).toEqual({
        bucket: 'test-bucket',
        key: 'feed/1234567890-test-image.jpg',
        source: Source.API,
        timestamp: 1234567890000,
        type: 'feed',
      });

      expect(mockS3Send).toHaveBeenCalledWith(expect.any(HeadObjectCommand));
    });

    it('should handle URL with different bucket name', async () => {
      const differentUrl =
        'https://my-custom-bucket.s3.us-east-1.amazonaws.com/detection/test-feed-456/9876543210-another-image.jpg';

      const result = await service.extractMetadataFromUrl(differentUrl);

      expect(result.bucket).toBe('my-custom-bucket');
      expect(result.key).toBe(
        'detection/test-feed-456/9876543210-another-image.jpg',
      );
      expect(result.type).toBe('detection');
      expect(result.timestamp).toBe(9876543210000);
    });

    it('should default to BUTTON source when metadata is missing', async () => {
      mockS3Send.mockResolvedValueOnce({
        ContentLength: 1024,
        Metadata: {},
      });

      const result = await service.extractMetadataFromUrl(validUrl);

      expect(result.source).toBe(Source.BUTTON);
    });

    it('should default to BUTTON source when metadata has invalid source', async () => {
      mockS3Send.mockResolvedValueOnce({
        ContentLength: 1024,
        Metadata: {
          'x-amz-meta-source': 'INVALID_SOURCE',
        },
      });

      const result = await service.extractMetadataFromUrl(validUrl);

      expect(result.source).toBe(Source.BUTTON);
    });

    it('should handle all valid source types', async () => {
      const sources = [Source.BUTTON, Source.API, Source.SCRIPT, Source.TEST];

      for (const source of sources) {
        mockS3Send.mockResolvedValueOnce({
          ContentLength: 1024,
          Metadata: {
            'x-amz-meta-source': source,
          },
        });

        const result = await service.extractMetadataFromUrl(validUrl);
        expect(result.source).toBe(source);
      }
    });

    it('should throw error for invalid S3 URL format', async () => {
      const invalidUrls = [
        'https://invalid-url.com/file.jpg',
        'https://bucket.storage.amazonaws.com/file.jpg',
        'https://bucket.amazonaws.com/file.jpg',
        'not-a-url',
      ];

      for (const invalidUrl of invalidUrls) {
        await expect(
          service.extractMetadataFromUrl(invalidUrl),
        ).rejects.toThrow('Invalid S3 URL format');
      }
    });

    it('should throw error for invalid S3 key format', async () => {
      const urlWithInvalidKey =
        'https://test-bucket.s3.us-west-2.amazonaws.com/invalid/key/format';

      await expect(
        service.extractMetadataFromUrl(urlWithInvalidKey),
      ).rejects.toThrow('Invalid S3 URL format');
    });

    it('should throw error when filename lacks timestamp', async () => {
      const urlWithInvalidFilename =
        'https://test-bucket.s3.us-west-2.amazonaws.com/feed/no-timestamp-image.jpg';

      await expect(
        service.extractMetadataFromUrl(urlWithInvalidFilename),
      ).rejects.toThrow('Invalid S3 URL format');
    });

    it('should handle S3 headObject errors', async () => {
      mockS3Send.mockRejectedValueOnce(new Error('S3 access denied'));

      await expect(service.extractMetadataFromUrl(validUrl)).rejects.toThrow(
        'Invalid S3 URL format',
      );
    });

    it('should handle S3 headObject string errors', async () => {
      mockS3Send.mockRejectedValueOnce('String S3 access denied');

      await expect(service.extractMetadataFromUrl(validUrl)).rejects.toThrow(
        'Invalid S3 URL format',
      );
    });
  });

  describe('getObjectMetadata', () => {
    const bucket = 'test-bucket';
    const key = 'test-key.jpg';

    it('should return S3 object metadata successfully', async () => {
      const mockMetadata = {
        ContentLength: 2048,
        ContentType: 'image/jpeg',
        Metadata: {
          'x-amz-meta-source': 'BUTTON',
        },
      };

      mockS3Send.mockResolvedValue(mockMetadata);

      const result = await service.getObjectMetadata(bucket, key);

      expect(result).toEqual(mockMetadata);
      expect(mockS3Send).toHaveBeenCalledWith(expect.any(HeadObjectCommand));
    });

    it('should handle S3 headObject errors', async () => {
      const s3Error = new Error('Object not found');
      mockS3Send.mockRejectedValue(s3Error);

      await expect(service.getObjectMetadata(bucket, key)).rejects.toThrow(
        'Object not found',
      );
    });

    it('should handle S3 headObject string errors', async () => {
      const s3Error = 'String error message';
      mockS3Send.mockRejectedValue(s3Error);

      await expect(service.getObjectMetadata(bucket, key)).rejects.toBe(
        'String error message',
      );
    });
  });

  describe('getObjectSize', () => {
    const bucket = 'test-bucket';
    const key = 'test-key.jpg';

    it('should return object size from metadata', async () => {
      mockS3Send.mockResolvedValue({
        ContentLength: 5432,
      });

      const result = await service.getObjectSize(bucket, key);

      expect(result).toBe(5432);
    });

    it('should return 0 when ContentLength is undefined', async () => {
      mockS3Send.mockResolvedValue({
        ContentLength: undefined,
      });

      const result = await service.getObjectSize(bucket, key);

      expect(result).toBe(0);
    });

    it('should return 0 and log error when S3 call fails', async () => {
      mockS3Send.mockRejectedValue(new Error('Network error'));

      const result = await service.getObjectSize(bucket, key);

      expect(result).toBe(0);
    });

    it('should return 0 and log error when S3 call fails with string error', async () => {
      mockS3Send.mockRejectedValue('String network error');

      const result = await service.getObjectSize(bucket, key);

      expect(result).toBe(0);
    });
  });

  describe('extractMetadataFromS3Object', () => {
    const bucket = 'test-bucket';
    const key = 'feed/1234567890-test-image.jpg';

    it('should extract metadata from S3 object successfully', async () => {
      mockS3Send.mockResolvedValue({
        ContentLength: 1024,
        Metadata: {
          'x-amz-meta-source': 'API',
        },
      });

      const result = await (service as any).extractMetadataFromS3Object(
        bucket,
        key,
      );

      expect(result).toEqual({
        bucket: 'test-bucket',
        key: 'feed/1234567890-test-image.jpg',
        source: Source.API,
        timestamp: 1234567890000,
        type: 'feed',
      });
    });

    it('should handle detection type correctly', async () => {
      mockS3Send.mockResolvedValue({
        ContentLength: 1024,
        Metadata: {
          'x-amz-meta-source': 'BUTTON',
        },
      });

      const detectionKey =
        'detection/test-feed-456/9876543210-detection-image.jpg';
      const result = await (service as any).extractMetadataFromS3Object(
        bucket,
        detectionKey,
      );

      expect(result.type).toBe('detection');
      expect(result.timestamp).toBe(9876543210000);
    });

    it('should handle missing S3 metadata gracefully', async () => {
      mockS3Send.mockResolvedValue({
        ContentLength: 1024,
        Metadata: undefined,
      });

      const result = await (service as any).extractMetadataFromS3Object(
        bucket,
        key,
      );

      expect(result.source).toBe(Source.BUTTON);
    });
  });
});
