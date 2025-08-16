import { CreateFeedDTO } from '../dto/create-feed.dto';
import { FeedEvent } from '../entity/feed-event.entity';
import { FeedEventService } from './feed-event.service';
import { NotFoundException } from '@nestjs/common';
import { PatchFeedDTO } from '../dto/patch-feed.dto';
import { Repository, Between } from 'typeorm';
import { Source, Status } from '../../common/types';
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
    source: Source.API,
    status: Status.ACCEPTED,
    updatedAt: new Date(),
  };

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
        source: Source.API,
      };

      const createdEvent = { ...mockFeedEvent, ...createFeedDTO };
      mockRepository.create.mockReturnValue(createdEvent);
      mockRepository.save.mockResolvedValue(createdEvent);

      const result = await service.create(createFeedDTO);

      expect(repository.create).toHaveBeenCalledWith(createFeedDTO);
      expect(repository.save).toHaveBeenCalledWith(createdEvent);
      expect(result).toEqual(createdEvent);
    });

    it('should handle repository errors', async () => {
      const createFeedDTO: CreateFeedDTO = {
        imageUrl: 'https://example.com/image.jpg',
        source: Source.API,
      };

      const error = new Error('Repository error');
      mockRepository.create.mockReturnValue({});
      mockRepository.save.mockRejectedValue(error);

      await expect(service.create(createFeedDTO)).rejects.toThrow(
        'Repository error',
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

    it('should return null when feed event not found', async () => {
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
    it('should update a feed event successfully', async () => {
      const patchFeedDTO: PatchFeedDTO = {
        id: 'test-uuid',
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

      const result = await service.update(patchFeedDTO);

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: patchFeedDTO.id },
      });
      expect(repository.update).toHaveBeenCalledWith(patchFeedDTO.id, {
        confidence: patchFeedDTO.confidence,
        croppedImageUrl: patchFeedDTO.croppedImageUrl,
        status: patchFeedDTO.status,
      });
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException when feed event not found', async () => {
      const patchFeedDTO: PatchFeedDTO = {
        id: 'non-existent-uuid',
        confidence: 0.95,
        croppedImageUrl: 'https://example.com/cropped.jpg',
        status: Status.REJECTED,
      };

      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.update(patchFeedDTO)).rejects.toThrow(
        NotFoundException,
      );
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: patchFeedDTO.id },
      });
    });

    it('should handle repository errors', async () => {
      const patchFeedDTO: PatchFeedDTO = {
        id: 'test-uuid',
        confidence: 0.95,
        croppedImageUrl: 'https://example.com/cropped.jpg',
        status: Status.REJECTED,
      };

      const error = new Error('Repository error');
      mockRepository.findOne.mockRejectedValue(error);

      await expect(service.update(patchFeedDTO)).rejects.toThrow(
        'Repository error',
      );
    });
  });
});
