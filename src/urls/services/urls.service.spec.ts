import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreateFeedImageUrlDto, CreateDetectionImageUrlDto } from '../dto';
import { ImageFormat } from '../../common/types';
import { S3Client } from '@aws-sdk/client-s3';
import { Test, TestingModule } from '@nestjs/testing';
import { UrlsService } from './urls.service';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/s3-request-presigner');

const mockS3Client = S3Client as jest.MockedClass<typeof S3Client>;
const mockGetSignedUrl = getSignedUrl as jest.MockedFunction<
  typeof getSignedUrl
>;

describe('UrlsService', () => {
  let service: UrlsService;

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    delete process.env.S3_BUCKET_NAME;
    delete process.env.AWS_REGION;

    mockConfigService.get.mockImplementation((key: string) => {
      switch (key) {
        case 'S3_BUCKET_NAME':
          return 'test-bucket';
        case 'AWS_REGION':
          return 'us-west-2';
        default:
          return undefined;
      }
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UrlsService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<UrlsService>(UrlsService);

    mockS3Client.mockImplementation(() => ({}) as any);

    mockGetSignedUrl.mockResolvedValue(
      'https://test-bucket.s3.amazonaws.com/test-url?signature=...',
    );

    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create S3 client with correct region', () => {
      expect(mockS3Client).toHaveBeenCalledWith({
        region: 'us-west-2',
      });
    });

    it('should use default region when AWS_REGION is not set', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'S3_BUCKET_NAME') {
          return 'test-bucket';
        }
        if (key === 'AWS_REGION') {
          return undefined;
        }
        return undefined;
      });

      new UrlsService(mockConfigService as any);

      expect(mockS3Client).toHaveBeenCalledWith({
        region: 'us-west-2',
      });
    });

    it('should throw error when S3_BUCKET_NAME is not set', () => {
      mockConfigService.get.mockReturnValue(undefined);

      expect(() => new UrlsService(mockConfigService as any)).toThrow(
        'S3_BUCKET_NAME environment variable is required',
      );
    });
  });

  describe('createFeedImageSignedUrl', () => {
    it('should create a feed image signed URL successfully', async () => {
      const createFeedImageUrlDto: CreateFeedImageUrlDto = {
        fileName: 'test-image',
        format: ImageFormat.JPG,
        source: 'pi-feeder-001',
        contentType: 'image/jpeg',
      };

      const result = await service.createFeedImageSignedUrl(
        createFeedImageUrlDto,
      );

      expect(result).toHaveProperty('signedUrl');
      expect(result).toHaveProperty('key');
      expect(result).toHaveProperty('expiresAt');
      expect(result).toHaveProperty('bucket');
      expect(result).toHaveProperty('metadata');

      expect(result.key).toMatch(/^feed\/\d+-test-image\.jpg$/);
      expect(result.bucket).toBe('test-bucket');
      expect(result.metadata.source).toBe('pi-feeder-001');
      expect(result.metadata.type).toBe('feed');
      expect(result.metadata.timestamp).toBeGreaterThan(0);
    });

    it('should use default content type when not provided', async () => {
      const createFeedImageUrlDto: CreateFeedImageUrlDto = {
        fileName: 'test-image',
        format: ImageFormat.PNG,
        source: 'pi-feeder-001',
      };

      await service.createFeedImageSignedUrl(createFeedImageUrlDto);

      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('should handle errors and throw BadRequestException', async () => {
      const createFeedImageUrlDto: CreateFeedImageUrlDto = {
        fileName: 'test-image',
        format: ImageFormat.JPG,
        source: 'pi-feeder-001',
      };

      const error = new Error('S3 error');
      mockGetSignedUrl.mockRejectedValue(error);

      await expect(
        service.createFeedImageSignedUrl(createFeedImageUrlDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('createDetectionImageSignedUrl', () => {
    it('should create a detection image signed URL successfully', async () => {
      const createDetectionImageUrlDto: CreateDetectionImageUrlDto = {
        fileName: 'motion-detected',
        format: ImageFormat.PNG,
        feedEventId: 'feed-123',
        contentType: 'image/png',
      };

      const result = await service.createDetectionImageSignedUrl(
        createDetectionImageUrlDto,
      );

      expect(result).toHaveProperty('signedUrl');
      expect(result).toHaveProperty('key');
      expect(result).toHaveProperty('expiresAt');
      expect(result).toHaveProperty('bucket');
      expect(result).toHaveProperty('metadata');

      expect(result.key).toMatch(
        /^detection\/feed-123\/\d+-motion-detected\.png$/,
      );
      expect(result.bucket).toBe('test-bucket');
      expect(result.metadata.feedEventId).toBe('feed-123');
      expect(result.metadata.type).toBe('detection');
      expect(result.metadata.timestamp).toBeGreaterThan(0);
    });

    it('should use default content type when not provided', async () => {
      const createDetectionImageUrlDto: CreateDetectionImageUrlDto = {
        fileName: 'motion-detected',
        format: ImageFormat.JPG,
        feedEventId: 'feed-123',
      };

      await service.createDetectionImageSignedUrl(createDetectionImageUrlDto);

      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('should handle errors and throw BadRequestException', async () => {
      const createDetectionImageUrlDto: CreateDetectionImageUrlDto = {
        fileName: 'motion-detected',
        format: ImageFormat.PNG,
        feedEventId: 'feed-123',
      };

      const error = new Error('S3 error');
      mockGetSignedUrl.mockRejectedValue(error);

      await expect(
        service.createDetectionImageSignedUrl(createDetectionImageUrlDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getContentType', () => {
    it('should return correct content type for JPG', () => {
      const result = (service as any).getContentType(ImageFormat.JPG);
      expect(result).toBe('image/jpeg');
    });

    it('should return correct content type for JPEG', () => {
      const result = (service as any).getContentType(ImageFormat.JPEG);
      expect(result).toBe('image/jpeg');
    });

    it('should return correct content type for PNG', () => {
      const result = (service as any).getContentType(ImageFormat.PNG);
      expect(result).toBe('image/png');
    });

    it('should return default content type for unknown format', () => {
      const result = (service as any).getContentType('unknown' as any);
      expect(result).toBe('application/octet-stream');
    });
  });

  describe('S3 command configuration', () => {
    it('should call getSignedUrl with correct parameters for feed images', async () => {
      const createFeedImageUrlDto: CreateFeedImageUrlDto = {
        fileName: 'test-image',
        format: ImageFormat.JPG,
        source: 'pi-feeder-001',
      };

      await service.createFeedImageSignedUrl(createFeedImageUrlDto);

      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.objectContaining({
          expiresIn: 900,
        }),
      );
    });

    it('should call getSignedUrl with correct parameters for detection images', async () => {
      const createDetectionImageUrlDto: CreateDetectionImageUrlDto = {
        fileName: 'motion-detected',
        format: ImageFormat.PNG,
        feedEventId: 'feed-123',
      };

      await service.createDetectionImageSignedUrl(createDetectionImageUrlDto);

      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.objectContaining({
          expiresIn: 900,
        }),
      );
    });
  });
});
