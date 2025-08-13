import { BaseSeeder } from './base-seeder';
import { DetectionEvent } from '../../../src/detection/entity/detection-event.entity';
import { FeedEvent } from '../../../src/feed/entity/feed-event.entity';

export class DetectionEventSeeder extends BaseSeeder {
  async seed(): Promise<void> {
    console.log('Seeding detection events...');

    // Get existing feed events to reference...

    const feedEventRepository = this.dataSource.getRepository(FeedEvent);
    const feedEvents = await feedEventRepository.find();
    
    if (feedEvents.length === 0) {
      console.log('Warning: No feed events found. Please seed feed events first.');
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

    const detectionEventRepository = this.dataSource.getRepository(DetectionEvent);
    await detectionEventRepository.save(detectionEvents);

    console.log(`Seeded ${detectionEvents.length} detection events across ${feedEvents.length} feed events`);
  }

  async clear(): Promise<void> {
    console.log('Clearing detection events...');
    await this.clearTable('detection_event');
    console.log('Cleared detection events');
  }

  async drop(): Promise<void> {
    console.log('Dropping detection_event table...');
    await this.dropTable('detection_event');
    console.log('Dropped detection_event table');
  }
} 