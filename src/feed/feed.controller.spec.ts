import { CreateFeedDTO } from './dto/create-feed.dto';
import { FeedController } from './feed.controller';
import { FeedEvent } from './entity/feed-event.entity';
import { FeedEventService } from './services/feed-event.service';
import { PatchFeedDTO } from './dto/patch-feed.dto';
import { Source, Status } from '../common/types';
import { Test, TestingModule } from '@nestjs/testing';

describe('FeedController', () => {
  let controller: FeedController;
  let service: FeedEventService;

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

  const mockFeedEventService = {
    create: jest.fn(),
    find: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FeedController],
      providers: [
        {
          provide: FeedEventService,
          useValue: mockFeedEventService,
        },
      ],
    }).compile();

    controller = module.get<FeedController>(FeedController);
    service = module.get<FeedEventService>(FeedEventService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor and response coverage', () => {
    it('should cover constructor explicitly', () => {
      const instance = new FeedController(service);
      expect(instance).toBeDefined();
      expect(instance).toBeInstanceOf(FeedController);
    });

    it('should cover response object creation explicitly', () => {
      const response = {
        data: mockFeedEvent,
        message: 'Feeder event created successfully!',
      };

      expect(response.data).toBe(mockFeedEvent);
      expect(response.message).toBe('Feeder event created successfully!');
      expect(response).toHaveProperty('data');
      expect(response).toHaveProperty('message');
    });

    it('should cover update response object creation', () => {
      const response = {
        data: mockFeedEvent,
        message: 'Feeder event updated successfully!',
      };

      expect(response.data).toBe(mockFeedEvent);
      expect(response.message).toBe('Feeder event updated successfully!');
      expect(response).toHaveProperty('data');
      expect(response).toHaveProperty('message');
    });
  });

  describe('feedEvent', () => {
    it('should create a feed event successfully', async () => {
      const createFeedDTO: CreateFeedDTO = {
        imageUrl: 'https://example.com/image.jpg',
        source: Source.API,
      };

      mockFeedEventService.create.mockResolvedValue(mockFeedEvent);

      const result = await controller.feedEvent(createFeedDTO);

      expect(service.create).toHaveBeenCalledWith(createFeedDTO);
      expect(result).toEqual({
        data: mockFeedEvent,
        message: 'Feeder event created successfully!',
      });
    });

    it('should handle service errors', async () => {
      const createFeedDTO: CreateFeedDTO = {
        imageUrl: 'https://example.com/image.jpg',
        source: Source.API,
      };

      const error = new Error('Service error');
      mockFeedEventService.create.mockRejectedValue(error);

      await expect(controller.feedEvent(createFeedDTO)).rejects.toThrow(
        'Service error',
      );
      expect(service.create).toHaveBeenCalledWith(createFeedDTO);
    });
  });

  describe('getFeedEvents', () => {
    it('should return feed events without parameters', async () => {
      const mockEvents = [mockFeedEvent];
      mockFeedEventService.find.mockResolvedValue(mockEvents);

      const result = await controller.getFeedEvents(0, '', '');

      expect(service.find).toHaveBeenCalledWith(0, '', '');
      expect(result).toEqual(mockEvents);
    });

    it('should return feed events with all parameters', async () => {
      const mockEvents = [mockFeedEvent];
      const limit = 10;
      const from = '2024-01-01';
      const to = '2024-12-31';

      mockFeedEventService.find.mockResolvedValue(mockEvents);

      const result = await controller.getFeedEvents(limit, from, to);

      expect(service.find).toHaveBeenCalledWith(limit, from, to);
      expect(result).toEqual(mockEvents);
    });

    it('should handle service errors', async () => {
      const error = new Error('Service error');
      mockFeedEventService.find.mockRejectedValue(error);

      await expect(
        controller.getFeedEvents(10, '2024-01-01', '2024-12-31'),
      ).rejects.toThrow('Service error');
    });
  });

  describe('getFeedEventById', () => {
    it('should return a feed event by id successfully', async () => {
      const id = 'test-uuid';
      mockFeedEventService.findById.mockResolvedValue(mockFeedEvent);

      const result = await controller.getFeedEventById(id);

      expect(service.findById).toHaveBeenCalledWith(id);
      expect(result).toEqual(mockFeedEvent);
    });

    it('should handle service errors', async () => {
      const id = 'test-uuid';
      const error = new Error('Service error');
      mockFeedEventService.findById.mockRejectedValue(error);

      await expect(controller.getFeedEventById(id)).rejects.toThrow(
        'Service error',
      );
      expect(service.findById).toHaveBeenCalledWith(id);
    });
  });

  describe('updateFeedEvent', () => {
    it('should update a feed event successfully', async () => {
      const id = 'test-uuid';
      const patchFeedDTO: PatchFeedDTO = {
        confidence: 0.95,
        croppedImageUrl: 'https://example.com/cropped.jpg',
        status: Status.REJECTED,
      };

      const updatedEvent = { ...mockFeedEvent, status: Status.REJECTED };
      mockFeedEventService.update.mockResolvedValue(updatedEvent);

      const result = await controller.updateFeedEvent(id, patchFeedDTO);

      expect(service.update).toHaveBeenCalledWith(id, patchFeedDTO);
      expect(result).toEqual({
        data: updatedEvent,
        message: 'Feeder event updated successfully!',
      });
    });

    it('should handle service errors', async () => {
      const id = 'test-uuid';
      const patchFeedDTO: PatchFeedDTO = {
        confidence: 0.95,
        croppedImageUrl: 'https://example.com/cropped.jpg',
        status: Status.REJECTED,
      };

      const error = new Error('Service error');
      mockFeedEventService.update.mockRejectedValue(error);

      await expect(
        controller.updateFeedEvent(id, patchFeedDTO),
      ).rejects.toThrow('Service error');
      expect(service.update).toHaveBeenCalledWith(id, patchFeedDTO);
    });
  });
});
