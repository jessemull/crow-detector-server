import { ForbiddenException } from '@nestjs/common';
import { CreatePorchClipUrlDto, CreateFeederClipUrlDto } from './dto';
import { Test, TestingModule } from '@nestjs/testing';
import { UrlsController } from './urls.controller';
import { UrlsService } from './services/urls.service';

describe('UrlsController', () => {
  let controller: UrlsController;
  let service: UrlsService;

  const mockUrlsService = {
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

  describe('createPorchClipSignedUrl', () => {
    it('should create a porch clip signed URL', async () => {
      const createPorchClipUrlDto: CreatePorchClipUrlDto = {
        fileName: 'clip-1',
        contentLength: 1200,
      };
      const expected = {
        signedUrl: 'https://test-bucket.s3.amazonaws.com/porch/clip.mp4',
        key: 'porch/1-clip-1.mp4',
      };

      mockUrlsService.createPorchClipSignedUrl.mockResolvedValue(expected);

      const result = await controller.createPorchClipSignedUrl(
        createPorchClipUrlDto,
        { deviceId: 'pi-porch' } as never,
      );

      expect(service.createPorchClipSignedUrl).toHaveBeenCalledWith(
        createPorchClipUrlDto,
      );
      expect(result).toEqual(expected);
    });

    it('should reject a non-porch device', async () => {
      await expect(
        controller.createPorchClipSignedUrl(
          { fileName: 'clip-1', contentLength: 1200 },
          { deviceId: 'pi-user' } as never,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(service.createPorchClipSignedUrl).not.toHaveBeenCalled();
    });
  });

  describe('createFeederClipSignedUrl', () => {
    it('should create a feeder clip signed URL', async () => {
      const dto: CreateFeederClipUrlDto = {
        fileName: 'clip-1',
        contentLength: 128,
      };
      mockUrlsService.createFeederClipSignedUrl.mockResolvedValue({
        key: 'feeder/1-clip-1.mp4',
      });

      const result = await controller.createFeederClipSignedUrl(dto, {
        deviceId: 'pi-feeder',
      } as never);

      expect(service.createFeederClipSignedUrl).toHaveBeenCalledWith(dto);
      expect(result).toEqual({ key: 'feeder/1-clip-1.mp4' });
    });

    it('should allow the local development bypass', async () => {
      mockUrlsService.createFeederClipSignedUrl.mockResolvedValue({
        key: 'feeder/1-clip-1.mp4',
      });

      await controller.createFeederClipSignedUrl(
        { fileName: 'clip-1', contentLength: 128 },
        { deviceId: 'dev-mode' } as never,
      );

      expect(service.createFeederClipSignedUrl).toHaveBeenCalled();
    });

    it('should reject a non-feeder device', async () => {
      await expect(
        controller.createFeederClipSignedUrl(
          { fileName: 'clip-1', contentLength: 128 },
          { deviceId: 'pi-porch' } as never,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(service.createFeederClipSignedUrl).not.toHaveBeenCalled();
    });
  });
});
