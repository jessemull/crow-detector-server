import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
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
        case 's3BucketName':
          return 'test-bucket';
        case 'awsRegion':
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
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create S3 client with correct region', () => {
      expect(mockS3Client).toHaveBeenCalledWith(
        expect.objectContaining({ region: 'us-west-2' }),
      );
    });

    it('should use default region when AWS_REGION is not set', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 's3BucketName') {
          return 'test-bucket';
        }
        if (key === 'awsRegion') {
          return undefined;
        }
        return undefined;
      });

      new UrlsService(mockConfigService as any);

      expect(mockS3Client).toHaveBeenCalledWith(
        expect.objectContaining({ region: 'us-west-2' }),
      );
    });

    it('should throw error when S3_BUCKET_NAME is not set', () => {
      mockConfigService.get.mockReturnValue(undefined);

      expect(() => new UrlsService(mockConfigService as any)).toThrow(
        's3BucketName (S3_BUCKET_NAME) is required',
      );
    });
  });

  describe('createPorchClipSignedUrl', () => {
    it('should create a porch clip signed URL under porch/', async () => {
      const result = await service.createPorchClipSignedUrl({
        fileName: 'clip-1',
        contentLength: 1200,
      });

      expect(result.key).toMatch(/^porch\/\d+-clip-1\.mp4$/);
      expect(result.metadata.type).toBe('porch');
      expect(result.bucket).toBe('test-bucket');
    });

    it('should reject an empty porch file name', async () => {
      await expect(
        service.createPorchClipSignedUrl({
          fileName: '!!!',
          contentLength: 1200,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw InternalServerErrorException when signing fails', async () => {
      mockGetSignedUrl.mockRejectedValue(new Error('S3 error'));
      await expect(
        service.createPorchClipSignedUrl({
          fileName: 'clip-1',
          contentLength: 1200,
        }),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('createFeederClipSignedUrl', () => {
    it('should create a feeder clip signed URL under feeder/', async () => {
      const result = await service.createFeederClipSignedUrl({
        fileName: 'clip-20261122-201000',
        contentType: 'video/mp4',
        contentLength: 4096,
      });

      expect(result.key).toMatch(/^feeder\/\d+-clip-20261122-201000\.mp4$/);
      expect(result.metadata.type).toBe('feeder');
      expect(result.bucket).toBe('test-bucket');
      const signedOptions = mockGetSignedUrl.mock.calls.at(-1)?.[2] as {
        expiresIn: number;
        signableHeaders: Set<string>;
      };
      expect(signedOptions.expiresIn).toBe(900);
      expect(signedOptions.signableHeaders).toEqual(new Set(['content-type']));
      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          ContentLength: 4096,
          ContentType: 'video/mp4',
        }),
      );
    });

    it('should reject a feeder content type other than video/mp4', async () => {
      await expect(
        service.createFeederClipSignedUrl({
          fileName: 'clip-1',
          contentLength: 128,
          contentType: 'image/jpeg',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject a feeder clip larger than the upload cap', async () => {
      await expect(
        service.createFeederClipSignedUrl({
          fileName: 'clip-1',
          contentLength: 100 * 1024 * 1024 + 1,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw InternalServerErrorException when signing fails', async () => {
      mockGetSignedUrl.mockRejectedValue(new Error('S3 error'));
      await expect(
        service.createFeederClipSignedUrl({
          fileName: 'clip-1',
          contentLength: 128,
        }),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });
});
