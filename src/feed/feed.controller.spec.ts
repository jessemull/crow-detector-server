import { Test, TestingModule } from '@nestjs/testing';
import { FeedController } from './feed.controller';
import { FeedEventService } from './services/feed-event.service';
import { CreateFeedDTO } from './dto/create-feed.dto';
import { PatchFeedDTO } from './dto/patch-feed.dto';
import { FeedEvent } from './entity/feed-event.entity';
import { Source, Status } from '../common/types';

describe('FeedController', () => {
  let controller: FeedController;
  let service: FeedEventService;

  const mockFeedEvent: FeedEvent = {
    id: 'test-uuid',
    imageUrl: 'https://example.com/image.jpg',
    source: Source.API,
    status: Status.ACCEPTED,
    isAppropriate: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    detectionEvents: [],
  };

  const mockFeedEventService = {
    create: jest.fn(),
    find: jest.fn(),
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

      await expect(controller.feedEvent(createFeedDTO)).rejects.toThrow('Service error');
      expect(service.create).toHaveBeenCalledWith(createFeedDTO);
    });
  });

  describe('getFeedEvents', () => {
    it('should return feed events without parameters', async () => {
      const mockEvents = [mockFeedEvent];
      mockFeedEventService.find.mockResolvedValue(mockEvents);

      const result = await controller.getFeedEvents(10, '2024-01-01', '2024-12-31');

      expect(service.find).toHaveBeenCalledWith(10, '2024-01-01', '2024-12-31');
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

      await expect(controller.getFeedEvents(10, '2024-01-01', '2024-12-31')).rejects.toThrow('Service error');
    });
  });

  describe('updateFeedEvent', () => {
    it('should update a feed event successfully', async () => {
      const patchFeedDTO: PatchFeedDTO = {
        id: 'test-uuid',
        confidence: 0.95,
        croppedImageUrl: 'https://example.com/cropped.jpg',
        status: Status.REJECTED,
      };

      const updatedEvent = { ...mockFeedEvent, status: Status.REJECTED };
      mockFeedEventService.update.mockResolvedValue(updatedEvent);

      const result = await controller.updateFeedEvent(patchFeedDTO);

      expect(service.update).toHaveBeenCalledWith(patchFeedDTO);
      expect(result).toEqual({
        data: updatedEvent,
        message: 'Feeder event updated successfully!',
      });
    });

    it('should handle service errors', async () => {
      const patchFeedDTO: PatchFeedDTO = {
        id: 'test-uuid',
        confidence: 0.95,
        croppedImageUrl: 'https://example.com/cropped.jpg',
        status: Status.REJECTED,
      };

      const error = new Error('Service error');
      mockFeedEventService.update.mockRejectedValue(error);

      await expect(controller.updateFeedEvent(patchFeedDTO)).rejects.toThrow('Service error');
      expect(service.update).toHaveBeenCalledWith(patchFeedDTO);
    });
  });
});
