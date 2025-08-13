import { BaseSeeder } from './base-seeder';
import { FeedEvent } from '../../../src/feed/entity/feed-event.entity';
import { Source, Status } from '../../../src/common/types/feed';

export class FeedEventSeeder extends BaseSeeder {
  async seed(): Promise<void> {
    console.log('Seeding feed events...');

    const feedEvents: Partial<FeedEvent>[] = [];

    for (let i = 0; i < 20; i++) {
      const feedEvent: Partial<FeedEvent> = {
        id: this.getRandomUuid(),
        confidence: this.getRandomFloat(0.1, 1.0, 3),
        createdAt: this.getRandomDate(),
        updatedAt: new Date(),
        imageUrl: this.getRandomImageUrl(),
        croppedImageUrl: this.getRandomBoolean() ? this.getRandomImageUrl() : undefined,
        isAppropriate: this.getRandomBoolean(),
        source: this.getRandomEnumValue(Source),
        status: this.getRandomBoolean() ? this.getRandomEnumValue(Status) : undefined,
      };

      feedEvents.push(feedEvent);
    }

    const feedEventRepository = this.dataSource.getRepository(FeedEvent);
    await feedEventRepository.save(feedEvents);

    console.log(`Seeded ${feedEvents.length} feed events`);
  }

  async clear(): Promise<void> {
    console.log('Clearing feed events...');
    await this.clearTable('feed_event');
    console.log('Cleared feed events');
  }

  async drop(): Promise<void> {
    console.log('Dropping feed_event table...');
    await this.dropTable('feed_event');
    console.log('Dropped feed_event table');
  }
} 