import { CreateDetectionDTO } from '../dto/create-detection.dto';
import { DetectionEvent } from '../entity/detection-event.entity';
import { DetectionEventService } from './detection-event.service';
import { DetectionImageProcessingService } from './detection-image-processing.service';
import { FeedEvent } from '../../feed/entity/feed-event.entity';
import { NotFoundException } from '@nestjs/common';
import { PatchDetectionDTO } from '../dto/patch-detection.dto';
import { Repository, Between } from 'typeorm';
import { S3MetadataService } from '../../feed/services/s3-metadata.service';
import { Source, Status, ProcessingStatus } from '../../common/types';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

describe('DetectionEventService', () => {
  let service: DetectionEventService;
  let repository: Repository<DetectionEvent>;

  const mockFeedEvent: FeedEvent = {
    createdAt: new Date(),
    detectionEvents: [],
    id: 'feed-uuid',
    imageUrl: 'https://example.com/feed-image.jpg',
    isAppropriate: true,
    source: Source.API,
    status: Status.ACCEPTED,
    updatedAt: new Date(),
    processingStatus: ProcessingStatus.COMPLETED,
    faceDetected: false,
  };

  const mockDetectionEvent: DetectionEvent = {
    confidence: 0.95,
    createdAt: new Date(),
    crowCount: 5,
    feedEvent: mockFeedEvent,
    id: 'detection-uuid',
    imageUrl: 'https://example.com/detection-image.jpg',
    updatedAt: new Date(),
  };

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const mockDetectionImageProcessingService = {
    processImage: jest.fn(),
  };

  const mockS3MetadataService = {
    extractMetadataFromUrl: jest.fn(),
    getObjectSize: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DetectionEventService,
        {
          provide: getRepositoryToken(DetectionEvent),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(FeedEvent),
          useValue: mockRepository,
        },
        {
          provide: DetectionImageProcessingService,
          useValue: mockDetectionImageProcessingService,
        },
        {
          provide: S3MetadataService,
          useValue: mockS3MetadataService,
        },
      ],
    }).compile();

    service = module.get<DetectionEventService>(DetectionEventService);
    repository = module.get<Repository<DetectionEvent>>(
      getRepositoryToken(DetectionEvent),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a detection event successfully', async () => {
      const createDetectionDTO: CreateDetectionDTO = {
        imageUrl: 'https://example.com/detection-image.jpg',
      };

      const createdEvent = {
        ...mockDetectionEvent,
        ...createDetectionDTO,
        processingStatus: ProcessingStatus.PENDING,
        feedEvent: undefined,
      };
      mockRepository.create.mockReturnValue(createdEvent);
      mockRepository.save.mockResolvedValue(createdEvent);

      const result = await service.create(createDetectionDTO);

      expect(repository.create).toHaveBeenCalledWith({
        imageUrl: createDetectionDTO.imageUrl,
        processingStatus: ProcessingStatus.PENDING,
      });
      expect(repository.save).toHaveBeenCalledWith(createdEvent);
      expect(result).toEqual(createdEvent);
    });

    it('should handle repository errors', async () => {
      const createDetectionDTO: CreateDetectionDTO = {
        imageUrl: 'https://example.com/detection-image.jpg',
      };

      const error = new Error('Repository error');
      mockRepository.create.mockReturnValue({});
      mockRepository.save.mockRejectedValue(error);

      await expect(service.create(createDetectionDTO)).rejects.toThrow(
        'Repository error',
      );
    });
  });

  describe('find', () => {
    it('should return detection events without filters', async () => {
      const mockEvents = [mockDetectionEvent];
      mockRepository.find.mockResolvedValue(mockEvents);

      const result = await service.find();

      expect(repository.find).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
        take: undefined,
        where: {},
        relations: ['feedEvent'],
      });
      expect(result).toEqual(mockEvents);
    });

    it('should return detection events with limit only', async () => {
      const mockEvents = [mockDetectionEvent];
      const limit = 10;
      mockRepository.find.mockResolvedValue(mockEvents);

      const result = await service.find(limit);

      expect(repository.find).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
        take: limit,
        where: {},
        relations: ['feedEvent'],
      });
      expect(result).toEqual(mockEvents);
    });

    it('should return detection events with from date only', async () => {
      const mockEvents = [mockDetectionEvent];
      const from = '2024-01-01';
      const fromDate = new Date(from);
      const now = new Date();
      mockRepository.find.mockResolvedValue(mockEvents);

      const result = await service.find(undefined, from);

      expect(repository.find).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
        take: undefined,
        where: { createdAt: Between(fromDate, now) },
        relations: ['feedEvent'],
      });
      expect(result).toEqual(mockEvents);
    });

    it('should return detection events with both from and to dates', async () => {
      const mockEvents = [mockDetectionEvent];
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
        relations: ['feedEvent'],
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
    it('should return a detection event by id with relations', async () => {
      const id = 'test-uuid';
      mockRepository.findOne.mockResolvedValue(mockDetectionEvent);

      const result = await service.findById(id);

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id },
        relations: ['feedEvent'],
      });
      expect(result).toEqual(mockDetectionEvent);
    });

    it('should throw NotFoundException when detection event not found', async () => {
      const id = 'non-existent-uuid';
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.findById(id)).rejects.toThrow(NotFoundException);
    });

    it('should handle repository errors', async () => {
      const id = 'test-uuid';
      const error = new Error('Repository error');
      mockRepository.findOne.mockRejectedValue(error);

      await expect(service.findById(id)).rejects.toThrow('Repository error');
    });
  });

  describe('update', () => {
    it('should update a detection event successfully', async () => {
      const id = 'test-uuid';
      const patchDetectionDTO: PatchDetectionDTO = {
        confidence: 0.98,
        crowCount: 8,
      };

      mockRepository.findOne.mockResolvedValue(mockDetectionEvent);
      mockRepository.update.mockResolvedValue({ affected: 1 });
      mockRepository.findOne
        .mockResolvedValueOnce(mockDetectionEvent)
        .mockResolvedValueOnce({
          ...mockDetectionEvent,
          ...patchDetectionDTO,
        });

      const result = await service.update(id, patchDetectionDTO);

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id },
      });
      expect(repository.update).toHaveBeenCalledWith(id, patchDetectionDTO);
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException when detection event not found', async () => {
      const id = 'non-existent-uuid';
      const patchDetectionDTO: PatchDetectionDTO = {
        confidence: 0.98,
        crowCount: 8,
      };

      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.update(id, patchDetectionDTO)).rejects.toThrow(
        NotFoundException,
      );
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id },
      });
    });

    it('should handle repository errors', async () => {
      const id = 'test-uuid';
      const patchDetectionDTO: PatchDetectionDTO = {
        confidence: 0.98,
        crowCount: 8,
      };

      const error = new Error('Repository error');
      mockRepository.findOne.mockRejectedValue(error);

      await expect(service.update(id, patchDetectionDTO)).rejects.toThrow(
        'Repository error',
      );
    });
  });

  describe('processImageAsync', () => {
    beforeEach(() => {
      jest.spyOn(service as any, 'processImageAsync');
    });

    it('should process image successfully when animals are detected', async () => {
      const eventId = 'test-uuid';
      const imageUrl = 'https://example.com/image.jpg';

      mockS3MetadataService.extractMetadataFromUrl.mockResolvedValue({
        bucket: 'test-bucket',
        key: 'test-key',
        source: Source.API,
        timestamp: Date.now(),
        type: 'detection',
      });

      mockS3MetadataService.getObjectSize.mockResolvedValue(1024);

      mockDetectionImageProcessingService.processImage.mockResolvedValue({
        hasAnimals: true,
        crowCount: 2,
        animalCount: 3,
        detectedAnimals: ['Crow', 'Bird', 'Squirrel'],
        processingDuration: 1500,
      });

      mockRepository.update.mockResolvedValue({ affected: 1 });

      await (service as any).processImageAsync(eventId, imageUrl);

      expect(mockRepository.update).toHaveBeenCalledWith(eventId, {
        processingStatus: ProcessingStatus.PROCESSING,
      });

      expect(
        mockDetectionImageProcessingService.processImage,
      ).toHaveBeenCalledWith('test-bucket', 'test-key');

      expect(mockRepository.update).toHaveBeenCalledWith(eventId, {
        processingStatus: ProcessingStatus.COMPLETED,
        processingDuration: 1500,
        originalImageSize: 1024,
        detectedAnimals: '["Crow","Bird","Squirrel"]',
        crowCount: 2,
        animalCount: 3,
      });
    });

    it('should delete detection event when no animals are detected', async () => {
      const eventId = 'test-uuid';
      const imageUrl = 'https://example.com/image.jpg';

      mockS3MetadataService.extractMetadataFromUrl.mockResolvedValue({
        bucket: 'test-bucket',
        key: 'test-key',
        source: Source.API,
        timestamp: Date.now(),
        type: 'detection',
      });

      mockDetectionImageProcessingService.processImage.mockResolvedValue({
        hasAnimals: false,
        crowCount: 0,
        animalCount: 0,
        detectedAnimals: [],
        processingDuration: 800,
      });

      mockRepository.update.mockResolvedValue({ affected: 1 });
      mockRepository.delete.mockResolvedValue({ affected: 1 });

      await (service as any).processImageAsync(eventId, imageUrl);

      expect(mockRepository.update).toHaveBeenCalledWith(eventId, {
        processingStatus: ProcessingStatus.PROCESSING,
      });

      expect(mockRepository.delete).toHaveBeenCalledWith(eventId);
    });

    it('should handle image processing errors and mark as failed', async () => {
      const eventId = 'test-uuid';
      const imageUrl = 'https://example.com/image.jpg';

      mockS3MetadataService.extractMetadataFromUrl.mockResolvedValue({
        bucket: 'test-bucket',
        key: 'test-key',
        source: Source.API,
        timestamp: Date.now(),
        type: 'detection',
      });

      mockDetectionImageProcessingService.processImage.mockRejectedValue(
        new Error('AWS service unavailable'),
      );

      mockRepository.update.mockResolvedValue({ affected: 1 });

      await expect(
        (service as any).processImageAsync(eventId, imageUrl),
      ).rejects.toThrow('AWS service unavailable');

      expect(mockRepository.update).toHaveBeenCalledWith(eventId, {
        processingStatus: ProcessingStatus.FAILED,
        processingError: 'AWS service unavailable',
      });
    });

    it('should handle S3 metadata extraction errors', async () => {
      const eventId = 'test-uuid';
      const imageUrl = 'https://example.com/image.jpg';

      mockS3MetadataService.extractMetadataFromUrl.mockRejectedValue(
        new Error('Invalid S3 URL format'),
      );

      mockRepository.update.mockResolvedValue({ affected: 1 });

      await expect(
        (service as any).processImageAsync(eventId, imageUrl),
      ).rejects.toThrow('Invalid S3 URL format');

      expect(mockRepository.update).toHaveBeenCalledWith(eventId, {
        processingStatus: ProcessingStatus.FAILED,
        processingError: 'Invalid S3 URL format',
      });
    });

    it('should handle S3 object size retrieval errors', async () => {
      const eventId = 'test-uuid';
      const imageUrl = 'https://example.com/image.jpg';

      mockS3MetadataService.extractMetadataFromUrl.mockResolvedValue({
        bucket: 'test-bucket',
        key: 'test-key',
        source: Source.API,
        timestamp: Date.now(),
        type: 'detection',
      });

      mockDetectionImageProcessingService.processImage.mockResolvedValue({
        hasAnimals: true,
        crowCount: 1,
        animalCount: 1,
        detectedAnimals: ['Crow'],
        processingDuration: 1200,
      });

      mockS3MetadataService.getObjectSize.mockRejectedValue(
        new Error('S3 object not found'),
      );

      mockRepository.update.mockResolvedValue({ affected: 1 });

      await expect(
        (service as any).processImageAsync(eventId, imageUrl),
      ).rejects.toThrow('S3 object not found');

      expect(mockRepository.update).toHaveBeenCalledWith(eventId, {
        processingStatus: ProcessingStatus.FAILED,
        processingError: 'S3 object not found',
      });
    });
  });
});
