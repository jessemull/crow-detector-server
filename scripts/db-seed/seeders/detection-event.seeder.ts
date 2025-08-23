import { BaseSeeder } from './base-seeder';
import { DetectionEvent } from '../../../src/detection/entity/detection-event.entity';
import { FeedEvent } from '../../../src/feed/entity/feed-event.entity';
import { ProcessingStatus } from '../../../src/common/types';
import { createLogger } from '../../../src/common/logger/logger.config';

export class DetectionEventSeeder extends BaseSeeder {
  private logger = createLogger('DetectionEventSeeder');

  async seed(): Promise<void> {
    this.logger.info('Seeding detection events...');

    // Get existing feed events to reference...

    const feedEventRepository = this.dataSource.getRepository(FeedEvent);
    const feedEvents = await feedEventRepository.find();

    if (feedEvents.length === 0) {
      this.logger.warn('No feed events found. Please seed feed events first.');
      return;
    }

    const detectionEvents: Partial<DetectionEvent>[] = [];

    // Generate detection events for each feed event...

    for (const feedEvent of feedEvents) {
      // Each feed event gets 1-5 detection events...

      const detectionCount = this.getRandomNumber(1, 5);

      for (let i = 0; i < detectionCount; i++) {
        const processingStatus = this.getRandomEnumValue(ProcessingStatus);
        const hasAnimals = this.getRandomBoolean();
        const originalImageSize = this.getRandomNumber(500000, 5000000); // 500KB - 5MB
        const processingDuration = this.getRandomNumber(1000, 8000); // 1-8 seconds

        const detectionEvent: Partial<DetectionEvent> = {
          id: this.getRandomUuid(),
          confidence: this.getRandomFloat(0.1, 1.0, 3),
          createdAt: this.getRandomDate(),
          updatedAt: new Date(),
          crowCount: this.getRandomNumber(1, 20),
          animalCount: hasAnimals ? this.getRandomNumber(1, 10) : 0,
          imageUrl: this.getRandomImageUrl(),
          feedEvent: feedEvent,
          processingStatus,
          processingError:
            processingStatus === ProcessingStatus.FAILED
              ? 'Mock processing error for testing'
              : undefined,
          detectedAnimals: hasAnimals
            ? JSON.stringify(
                ['Crow', 'Bird', 'Squirrel'].slice(
                  0,
                  this.getRandomNumber(1, 3),
                ),
              )
            : undefined,
          originalImageSize,
          processingDuration,
        };

        detectionEvents.push(detectionEvent);
      }
    }

    const detectionEventRepository =
      this.dataSource.getRepository(DetectionEvent);
    await detectionEventRepository.save(detectionEvents);

    this.logger.info(
      {
        detectionCount: detectionEvents.length,
        feedCount: feedEvents.length,
      },
      'Seeded detection events',
    );
  }

  async clear(): Promise<void> {
    this.logger.info('Clearing detection events...');
    await this.clearTable('detection_event');
    this.logger.info('Cleared detection events');
  }

  async drop(): Promise<void> {
    this.logger.info('Dropping detection_event table...');
    await this.dropTable('detection_event');
    this.logger.info('Dropped detection_event table');
  }
}
