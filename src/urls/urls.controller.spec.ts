import { CreateFeedImageUrlDto, CreateDetectionImageUrlDto } from './dto';
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
});
