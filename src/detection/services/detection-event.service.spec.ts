import { CreateDetectionDTO } from '../dto/create-detection.dto';
import { DetectionEvent } from '../entity/detection-event.entity';
import { DetectionEventService } from './detection-event.service';
import { FeedEvent } from '../../feed/entity/feed-event.entity';
import { NotFoundException } from '@nestjs/common';
import { PatchDetectionDTO } from '../dto/patch-detection.dto';
import { Repository, Between } from 'typeorm';
import { Source, Status } from '../../common/types';
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
        feedEvent: 'feed-uuid',
        imageUrl: 'https://example.com/detection-image.jpg',
      };

      const createdEvent = { ...mockDetectionEvent, ...createDetectionDTO };
      mockRepository.create.mockReturnValue(createdEvent);
      mockRepository.save.mockResolvedValue(createdEvent);

      mockRepository.findOne.mockResolvedValueOnce(mockFeedEvent);

      const result = await service.create(createDetectionDTO);

      expect(repository.create).toHaveBeenCalledWith({
        feedEvent: mockFeedEvent,
        imageUrl: createDetectionDTO.imageUrl,
      });
      expect(repository.save).toHaveBeenCalledWith(createdEvent);
      expect(result).toEqual(createdEvent);
    });

    it('should throw NotFoundException when feed event not found', async () => {
      const createDetectionDTO: CreateDetectionDTO = {
        feedEvent: 'non-existent-feed-uuid',
        imageUrl: 'https://example.com/detection-image.jpg',
      };

      mockRepository.findOne.mockResolvedValueOnce(null);

      await expect(service.create(createDetectionDTO)).rejects.toThrow(
        NotFoundException,
      );
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: createDetectionDTO.feedEvent },
      });
    });

    it('should handle repository errors', async () => {
      const createDetectionDTO: CreateDetectionDTO = {
        feedEvent: 'feed-uuid',
        imageUrl: 'https://example.com/detection-image.jpg',
      };

      const error = new Error('Repository error');
      mockRepository.findOne.mockResolvedValue(mockFeedEvent);
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

    it('should return null when detection event not found', async () => {
      const id = 'non-existent-uuid';
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.findById(id);

      expect(result).toBeNull();
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
      const patchDetectionDTO: PatchDetectionDTO = {
        id: 'test-uuid',
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

      const result = await service.update(patchDetectionDTO);

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: patchDetectionDTO.id },
      });
      expect(repository.update).toHaveBeenCalledWith(patchDetectionDTO.id, {
        confidence: patchDetectionDTO.confidence,
        crowCount: patchDetectionDTO.crowCount,
      });
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException when detection event not found', async () => {
      const patchDetectionDTO: PatchDetectionDTO = {
        id: 'non-existent-uuid',
        confidence: 0.98,
        crowCount: 8,
      };

      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.update(patchDetectionDTO)).rejects.toThrow(
        NotFoundException,
      );
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: patchDetectionDTO.id },
      });
    });

    it('should handle repository errors', async () => {
      const patchDetectionDTO: PatchDetectionDTO = {
        id: 'test-uuid',
        confidence: 0.98,
        crowCount: 8,
      };

      const error = new Error('Repository error');
      mockRepository.findOne.mockRejectedValue(error);

      await expect(service.update(patchDetectionDTO)).rejects.toThrow(
        'Repository error',
      );
    });
  });
});
