import { BaseSeeder } from './base-seeder';
import { DetectionEvent } from '../../../src/detection/entity/detection-event.entity';
import { FeedEvent } from '../../../src/feed/entity/feed-event.entity';
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
        const detectionEvent: Partial<DetectionEvent> = {
          id: this.getRandomUuid(),
          confidence: this.getRandomFloat(0.1, 1.0, 3),
          createdAt: this.getRandomDate(),
          updatedAt: new Date(),
          crowCount: this.getRandomNumber(1, 20),
          imageUrl: this.getRandomImageUrl(),
          feedEvent: feedEvent,
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
