import { CreateFeedDTO } from '../dto/create-feed.dto';
import { FeedEvent } from '../entity/feed-event.entity';
import { FeedEventService } from './feed-event.service';
import { ImageProcessingService } from './image-processing.service';
import { NotFoundException } from '@nestjs/common';
import { PatchFeedDTO } from '../dto/patch-feed.dto';
import { Repository, Between } from 'typeorm';
import { S3MetadataService } from './s3-metadata.service';
import { Source, Status, ProcessingStatus } from '../../common/types';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

describe('FeedEventService', () => {
  let service: FeedEventService;
  let repository: Repository<FeedEvent>;

  const mockFeedEvent: FeedEvent = {
    createdAt: new Date(),
    detectionEvents: [],
    id: 'test-uuid',
    imageUrl: 'https://example.com/image.jpg',
    isAppropriate: true,
    source: Source.BUTTON,
    status: Status.ACCEPTED,
    updatedAt: new Date(),
    processingStatus: ProcessingStatus.PENDING,
    faceDetected: false,
  } as FeedEvent;

  const mockRepository = {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeedEventService,
        {
          provide: getRepositoryToken(FeedEvent),
          useValue: mockRepository,
        },
        {
          provide: ImageProcessingService,
          useValue: {
            processImage: jest.fn(),
            uploadProcessedImage: jest.fn(),
          },
        },
        {
          provide: S3MetadataService,
          useValue: {
            extractMetadataFromUrl: jest.fn().mockResolvedValue({
              bucket: 'test-bucket',
              key: 'test-key',
              source: Source.BUTTON,
              timestamp: Date.now(),
              type: 'feed' as const,
            }),
            getObjectSize: jest.fn().mockResolvedValue(1024),
          },
        },
      ],
    }).compile();

    service = module.get<FeedEventService>(FeedEventService);
    repository = module.get<Repository<FeedEvent>>(
      getRepositoryToken(FeedEvent),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a feed event successfully', async () => {
      const createFeedDTO: CreateFeedDTO = {
        imageUrl: 'https://example.com/image.jpg',
      };

      const createdEvent = { ...mockFeedEvent, ...createFeedDTO };
      mockRepository.create.mockReturnValue(createdEvent);
      mockRepository.save.mockResolvedValue(createdEvent);

      const result = await service.create(createFeedDTO);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          imageUrl: createFeedDTO.imageUrl,
          processingStatus: ProcessingStatus.PENDING,
        }),
      );
      expect(repository.save).toHaveBeenCalled();
      expect(result).toEqual(createdEvent);
    });

    it('should handle repository errors', async () => {
      const createFeedDTO: CreateFeedDTO = {
        imageUrl: 'https://example.com/image.jpg',
      };

      const error = new Error('Repository error');
      mockRepository.create.mockReturnValue({});
      mockRepository.save.mockRejectedValue(error);

      await expect(service.create(createFeedDTO)).rejects.toThrow(
        'Repository error',
      );
    });

    it('should handle repository string errors', async () => {
      const createFeedDTO: CreateFeedDTO = {
        imageUrl: 'https://example.com/image.jpg',
      };

      const error = 'String repository error';
      mockRepository.create.mockReturnValue({});
      mockRepository.save.mockRejectedValue(error);

      await expect(service.create(createFeedDTO)).rejects.toBe(
        'String repository error',
      );
    });
  });

  describe('find', () => {
    it('should return feed events without filters', async () => {
      const mockEvents = [mockFeedEvent];
      mockRepository.find.mockResolvedValue(mockEvents);

      const result = await service.find();

      expect(repository.find).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
        take: undefined,
        where: {},
      });
      expect(result).toEqual(mockEvents);
    });

    it('should return feed events with limit only', async () => {
      const mockEvents = [mockFeedEvent];
      const limit = 10;
      mockRepository.find.mockResolvedValue(mockEvents);

      const result = await service.find(limit);

      expect(repository.find).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
        take: limit,
        where: {},
      });
      expect(result).toEqual(mockEvents);
    });

    it('should return feed events with from date only', async () => {
      const mockEvents = [mockFeedEvent];
      const from = '2024-01-01';
      const fromDate = new Date(from);
      const now = new Date();
      mockRepository.find.mockResolvedValue(mockEvents);

      const result = await service.find(undefined, from);

      expect(repository.find).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
        take: undefined,
        where: { createdAt: Between(fromDate, now) },
      });
      expect(result).toEqual(mockEvents);
    });

    it('should return feed events with both from and to dates', async () => {
      const mockEvents = [mockFeedEvent];
      const from = '2024-01-01';
      const to = '2024-12-31';
      const fromDate = new Date(from);
      const toDate = new Date(to);
      mockRepository.find.mockResolvedValue(mockEvents);

      const result = await service.find(undefined, from, to);

      expect(repository.find).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
        take: undefined,
        where: { createdAt: Between(fromDate, toDate) },
      });
      expect(result).toEqual(mockEvents);
    });

    it('should handle repository errors', async () => {
      const error = new Error('Repository error');
      mockRepository.find.mockRejectedValue(error);

      await expect(
        service.find(10, '2024-01-01', '2024-12-31'),
      ).rejects.toThrow('Repository error');
    });
  });

  describe('findById', () => {
    it('should return a feed event by id with relations', async () => {
      const id = 'test-uuid';
      mockRepository.findOne.mockResolvedValue(mockFeedEvent);

      const result = await service.findById(id);

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id },
        relations: ['detectionEvents'],
      });
      expect(result).toEqual(mockFeedEvent);
    });

    it('should throw NotFoundException when feed event not found', async () => {
      const id = 'non-existent-uuid';
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.findById(id)).rejects.toThrow(
        `Feed event with id ${id} not found!`,
      );

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id },
        relations: ['detectionEvents'],
      });
    });

    it('should handle repository errors', async () => {
      const id = 'test-uuid';
      const error = new Error('Repository error');
      mockRepository.findOne.mockRejectedValue(error);

      await expect(service.findById(id)).rejects.toThrow('Repository error');
    });
  });

  describe('update', () => {
    it('should update a feed event successfully', async () => {
      const id = 'test-uuid';
      const patchFeedDTO: PatchFeedDTO = {
        confidence: 0.95,
        croppedImageUrl: 'https://example.com/cropped.jpg',
        status: Status.REJECTED,
      };

      mockRepository.findOne.mockResolvedValue(mockFeedEvent);
      mockRepository.update.mockResolvedValue({ affected: 1 });
      mockRepository.findOne
        .mockResolvedValueOnce(mockFeedEvent)
        .mockResolvedValueOnce({
          ...mockFeedEvent,
          ...patchFeedDTO,
        });

      const result = await service.update(id, patchFeedDTO);

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id },
      });
      expect(repository.update).toHaveBeenCalledWith(id, {
        confidence: patchFeedDTO.confidence,
        croppedImageUrl: patchFeedDTO.croppedImageUrl,
        status: patchFeedDTO.status,
      });
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException when feed event not found', async () => {
      const id = 'non-existent-uuid';
      const patchFeedDTO: PatchFeedDTO = {
        confidence: 0.95,
        croppedImageUrl: 'https://example.com/cropped.jpg',
        status: Status.REJECTED,
      };

      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.update(id, patchFeedDTO)).rejects.toThrow(
        NotFoundException,
      );
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id },
      });
    });

    it('should handle repository errors', async () => {
      const id = 'test-uuid';
      const patchFeedDTO: PatchFeedDTO = {
        confidence: 0.95,
        croppedImageUrl: 'https://example.com/cropped.jpg',
        status: Status.REJECTED,
      };

      const error = new Error('Repository error');
      mockRepository.findOne.mockRejectedValue(error);

      await expect(service.update(id, patchFeedDTO)).rejects.toThrow(
        'Repository error',
      );
    });
  });

  describe('processImageAsync', () => {
    const eventId = 'test-uuid';
    const bucket = 'test-bucket';
    const key = 'test-key.jpg';

    beforeEach(() => {
      mockRepository.update.mockResolvedValue({ affected: 1 });
    });

    it('should process image and upload cropped version when face detected and content appropriate', async () => {
      const imageProcessingService = service['imageProcessingService'];
      const s3MetadataService = service['s3MetadataService'];

      (imageProcessingService.processImage as jest.Mock).mockResolvedValue({
        contentModeration: { isAppropriate: true, labels: [], confidence: 95 },
        faceDetection: {
          faceDetected: true,
          boundingBox: { Width: 0.3, Height: 0.4, Left: 0.2, Top: 0.1 },
        },
        croppedImageBuffer: Buffer.from('cropped-image-data'),
        processingDuration: 1500,
      });

      (
        imageProcessingService.uploadProcessedImage as jest.Mock
      ).mockResolvedValue(
        'https://bucket.s3.amazonaws.com/processed/test-key_cropped.jpg',
      );

      (s3MetadataService.getObjectSize as jest.Mock).mockResolvedValue(512);

      await (service as any).processImageAsync(eventId, bucket, key);

      expect(repository.update).toHaveBeenCalledWith(eventId, {
        processingStatus: ProcessingStatus.PROCESSING,
      });

      expect(imageProcessingService.processImage).toHaveBeenCalledWith(
        bucket,
        key,
      );

      expect(imageProcessingService.uploadProcessedImage).toHaveBeenCalledWith(
        bucket,
        key,
        Buffer.from('cropped-image-data'),
      );

      expect(s3MetadataService.getObjectSize).toHaveBeenCalledWith(
        bucket,
        'processed/test-key_cropped.jpg',
      );

      expect(repository.update).toHaveBeenCalledWith(
        eventId,
        expect.objectContaining({
          processingStatus: ProcessingStatus.COMPLETED,
          isAppropriate: true,
          moderationLabels: '[]',
          faceDetected: true,
          faceBoundingBox: JSON.stringify({
            Width: 0.3,
            Height: 0.4,
            Left: 0.2,
            Top: 0.1,
          }),
          processingDuration: 1500,
          croppedImageUrl:
            'https://bucket.s3.amazonaws.com/processed/test-key_cropped.jpg',
          processedImageSize: 512,
        }),
      );
    });

    it('should process image without uploading cropped version when no face detected', async () => {
      const imageProcessingService = service['imageProcessingService'];

      (imageProcessingService.processImage as jest.Mock).mockResolvedValue({
        contentModeration: { isAppropriate: true, labels: [], confidence: 95 },
        faceDetection: { faceDetected: false },
        croppedImageBuffer: undefined,
        processingDuration: 800,
      });

      await (service as any).processImageAsync(eventId, bucket, key);

      expect(
        imageProcessingService.uploadProcessedImage,
      ).not.toHaveBeenCalled();

      expect(repository.update).toHaveBeenCalledWith(
        eventId,
        expect.objectContaining({
          processingStatus: ProcessingStatus.COMPLETED,
          isAppropriate: true,
          faceDetected: false,
          faceBoundingBox: undefined,
          processingDuration: 800,
        }),
      );
    });

    it('should process image without uploading cropped version when content inappropriate', async () => {
      const imageProcessingService = service['imageProcessingService'];

      (imageProcessingService.processImage as jest.Mock).mockResolvedValue({
        contentModeration: {
          isAppropriate: false,
          labels: ['Violence'],
          confidence: 87,
        },
        faceDetection: {
          faceDetected: true,
          boundingBox: { Width: 0.3, Height: 0.4, Left: 0.2, Top: 0.1 },
        },
        croppedImageBuffer: Buffer.from('cropped-image-data'),
        processingDuration: 900,
      });

      await (service as any).processImageAsync(eventId, bucket, key);

      expect(
        imageProcessingService.uploadProcessedImage,
      ).not.toHaveBeenCalled();

      expect(repository.update).toHaveBeenCalledWith(
        eventId,
        expect.objectContaining({
          processingStatus: ProcessingStatus.COMPLETED,
          isAppropriate: false,
          moderationLabels: '["Violence"]',
          faceDetected: true,
          processingDuration: 900,
        }),
      );
    });

    it('should handle image processing errors and mark as failed', async () => {
      const imageProcessingService = service['imageProcessingService'];
      const error = new Error('Image processing failed');

      (imageProcessingService.processImage as jest.Mock).mockRejectedValue(
        error,
      );

      await (service as any).processImageAsync(eventId, bucket, key);

      expect(repository.update).toHaveBeenCalledWith(eventId, {
        processingStatus: ProcessingStatus.PROCESSING,
      });

      expect(repository.update).toHaveBeenCalledWith(eventId, {
        processingStatus: ProcessingStatus.FAILED,
        processingError: 'Image processing failed',
      });
    });

    it('should handle image processing string errors and mark as failed', async () => {
      const imageProcessingService = service['imageProcessingService'];
      const error = 'String image processing failed';

      (imageProcessingService.processImage as jest.Mock).mockRejectedValue(
        error,
      );

      await (service as any).processImageAsync(eventId, bucket, key);

      expect(repository.update).toHaveBeenCalledWith(eventId, {
        processingStatus: ProcessingStatus.PROCESSING,
      });

      expect(repository.update).toHaveBeenCalledWith(eventId, {
        processingStatus: ProcessingStatus.FAILED,
        processingError: 'String image processing failed',
      });
    });
  });

  describe('reprocessImage', () => {
    const eventId = 'test-uuid';

    it('should reprocess image successfully', async () => {
      const s3MetadataService = service['s3MetadataService'];

      mockRepository.findOne.mockResolvedValue(mockFeedEvent);

      (s3MetadataService.extractMetadataFromUrl as jest.Mock).mockResolvedValue(
        {
          bucket: 'test-bucket',
          key: 'test-key.jpg',
          source: Source.BUTTON,
          timestamp: Date.now(),
          type: 'feed' as const,
        },
      );

      mockRepository.update.mockResolvedValue({ affected: 1 });

      await service.reprocessImage(eventId);

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: eventId },
        relations: ['detectionEvents'],
      });

      expect(s3MetadataService.extractMetadataFromUrl).toHaveBeenCalledWith(
        mockFeedEvent.imageUrl,
      );

      expect(repository.update).toHaveBeenCalledWith(eventId, {
        processingStatus: ProcessingStatus.PENDING,
        processingError: undefined,
      });
    });

    it('should handle errors when event not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.reprocessImage(eventId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should handle S3 metadata extraction errors', async () => {
      const s3MetadataService = service['s3MetadataService'];

      mockRepository.findOne.mockResolvedValue(mockFeedEvent);

      const error = new Error('S3 metadata extraction failed');
      (s3MetadataService.extractMetadataFromUrl as jest.Mock).mockRejectedValue(
        error,
      );

      await expect(service.reprocessImage(eventId)).rejects.toThrow(
        'S3 metadata extraction failed',
      );
    });

    it('should handle S3 metadata extraction string errors', async () => {
      const s3MetadataService = service['s3MetadataService'];

      mockRepository.findOne.mockResolvedValue(mockFeedEvent);

      const error = 'String S3 metadata extraction failed';
      (s3MetadataService.extractMetadataFromUrl as jest.Mock).mockRejectedValue(
        error,
      );

      await expect(service.reprocessImage(eventId)).rejects.toBe(
        'String S3 metadata extraction failed',
      );
    });
  });
});
