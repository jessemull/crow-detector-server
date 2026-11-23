import { ForbiddenException } from '@nestjs/common';
import {
  CreateFeedImageUrlDto,
  CreateDetectionImageUrlDto,
  CreatePorchClipUrlDto,
} from './dto';
import { ImageFormat } from '../common/types';
import { Test, TestingModule } from '@nestjs/testing';
import { UrlsController } from './urls.controller';
import { UrlsService } from './services/urls.service';

describe('UrlsController', () => {
  let controller: UrlsController;
  let service: UrlsService;

  const mockUrlsService = {
    createFeedImageSignedUrl: jest.fn(),
    createDetectionImageSignedUrl: jest.fn(),
    createPorchClipSignedUrl: jest.fn(),
    createFeederClipSignedUrl: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UrlsController],
      providers: [
        {
          provide: UrlsService,
          useValue: mockUrlsService,
        },
      ],
    }).compile();

    controller = module.get<UrlsController>(UrlsController);
    service = module.get<UrlsService>(UrlsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createFeedImageSignedUrl', () => {
    it('should create a feed image signed URL', async () => {
      const createFeedImageUrlDto: CreateFeedImageUrlDto = {
        fileName: 'test-image',
        format: ImageFormat.JPG,
        source: 'pi-feeder-001',
        contentType: 'image/jpeg',
      };

      const expectedResult = {
        signedUrl:
          'https://test-bucket.s3.amazonaws.com/feed/1234567890-test-image.jpg?signature=...',
        key: 'feed/1234567890-test-image.jpg',
        expiresAt: '2024-01-01T12:00:00.000Z',
        bucket: 'test-bucket',
        metadata: {
          timestamp: 1234567890,
          source: 'pi-feeder-001',
          type: 'feed',
        },
      };

      mockUrlsService.createFeedImageSignedUrl.mockResolvedValue(
        expectedResult,
      );

      const result = await controller.createFeedImageSignedUrl(
        createFeedImageUrlDto,
      );

      expect(service.createFeedImageSignedUrl).toHaveBeenCalledWith(
        createFeedImageUrlDto,
      );
      expect(result).toEqual(expectedResult);
    });

    it('should handle service errors gracefully', async () => {
      const createFeedImageUrlDto: CreateFeedImageUrlDto = {
        fileName: 'test-image',
        format: ImageFormat.JPG,
        source: 'pi-feeder-001',
      };

      const error = new Error('S3 service error');
      mockUrlsService.createFeedImageSignedUrl.mockRejectedValue(error);

      await expect(
        controller.createFeedImageSignedUrl(createFeedImageUrlDto),
      ).rejects.toThrow(error);
      expect(service.createFeedImageSignedUrl).toHaveBeenCalledWith(
        createFeedImageUrlDto,
      );
    });
  });

  describe('createDetectionImageSignedUrl', () => {
    it('should create a detection image signed URL', async () => {
      const createDetectionImageUrlDto: CreateDetectionImageUrlDto = {
        fileName: 'motion-detected',
        format: ImageFormat.PNG,
        contentType: 'image/png',
      };

      const expectedResult = {
        signedUrl:
          'https://test-bucket.s3.amazonaws.com/detection/feed-123/1234567890-motion-detected.png?signature=...',
        key: 'detection/feed-123/1234567890-motion-detected.png',
        expiresAt: '2024-01-01T12:00:00.000Z',
        bucket: 'test-bucket',
        metadata: {
          timestamp: 1234567890,
          feedEventId: 'feed-123',
          type: 'detection',
        },
      };

      mockUrlsService.createDetectionImageSignedUrl.mockResolvedValue(
        expectedResult,
      );

      const result = await controller.createDetectionImageSignedUrl(
        createDetectionImageUrlDto,
      );

      expect(service.createDetectionImageSignedUrl).toHaveBeenCalledWith(
        createDetectionImageUrlDto,
      );
      expect(result).toEqual(expectedResult);
    });

    it('should handle service errors gracefully', async () => {
      const createDetectionImageUrlDto: CreateDetectionImageUrlDto = {
        fileName: 'motion-detected',
        format: ImageFormat.PNG,
      };

      const error = new Error('S3 service error');
      mockUrlsService.createDetectionImageSignedUrl.mockRejectedValue(error);

      await expect(
        controller.createDetectionImageSignedUrl(createDetectionImageUrlDto),
      ).rejects.toThrow(error);
      expect(service.createDetectionImageSignedUrl).toHaveBeenCalledWith(
        createDetectionImageUrlDto,
      );
    });
  });

  describe('createPorchClipSignedUrl', () => {
    it('should create a porch clip signed URL for pi-porch', async () => {
      const createPorchClipUrlDto: CreatePorchClipUrlDto = {
        fileName: 'clip-20261114-210000',
        contentType: 'video/mp4',
      };

      const expectedResult = {
        signedUrl:
          'https://test-bucket.s3.amazonaws.com/porch/123-clip.mp4?signature=...',
        key: 'porch/123-clip-20261114-210000.mp4',
        expiresAt: '2024-01-01T12:00:00.000Z',
        bucket: 'test-bucket',
        metadata: {
          timestamp: 123,
          type: 'porch',
        },
      };

      mockUrlsService.createPorchClipSignedUrl.mockResolvedValue(
        expectedResult,
      );

      const result = await controller.createPorchClipSignedUrl(
        createPorchClipUrlDto,
        { deviceId: 'pi-porch' } as any,
      );

      expect(service.createPorchClipSignedUrl).toHaveBeenCalledWith(
        createPorchClipUrlDto,
      );
      expect(result).toEqual(expectedResult);
    });

    it('should reject other devices', async () => {
      await expect(
        controller.createPorchClipSignedUrl({ fileName: 'clip-1' }, {
          deviceId: 'pi-user',
        } as any),
      ).rejects.toThrow(ForbiddenException);
      expect(service.createPorchClipSignedUrl).not.toHaveBeenCalled();
    });
  });

  describe('createFeederClipSignedUrl', () => {
    it('should create a feeder clip signed URL for pi-feeder', async () => {
      const dto: CreatePorchClipUrlDto = {
        fileName: 'clip-20261122-201000',
        contentType: 'video/mp4',
      };
      const expectedResult = {
        signedUrl: 'https://test-bucket.s3.amazonaws.com/feeder/123-clip.mp4',
        key: 'feeder/123-clip-20261122-201000.mp4',
        expiresAt: '2024-01-01T12:00:00.000Z',
        bucket: 'test-bucket',
        metadata: { timestamp: 123, type: 'feeder' },
      };
      mockUrlsService.createFeederClipSignedUrl.mockResolvedValue(
        expectedResult,
      );

      const result = await controller.createFeederClipSignedUrl(dto, {
        deviceId: 'pi-feeder',
      } as any);

      expect(service.createFeederClipSignedUrl).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expectedResult);
    });

    it('should allow dev-mode', async () => {
      mockUrlsService.createFeederClipSignedUrl.mockResolvedValue({
        key: 'feeder/1-clip.mp4',
      });

      await controller.createFeederClipSignedUrl({ fileName: 'clip-1' }, {
        deviceId: 'dev-mode',
      } as any);

      expect(service.createFeederClipSignedUrl).toHaveBeenCalled();
    });

    it('should reject other devices', async () => {
      await expect(
        controller.createFeederClipSignedUrl({ fileName: 'clip-1' }, {
          deviceId: 'pi-porch',
        } as any),
      ).rejects.toThrow(ForbiddenException);
      expect(service.createFeederClipSignedUrl).not.toHaveBeenCalled();
    });
  });
});
