import { BaseSeeder } from './base-seeder';
import { FeedEvent } from '../../../src/feed/entity/feed-event.entity';
import { Source, Status } from '../../../src/common/types/feed';
import { createLogger } from '../../../src/common/logger/logger.config';

export class FeedEventSeeder extends BaseSeeder {
  private logger = createLogger('FeedEventSeeder');

  async seed(): Promise<void> {
    this.logger.info('Seeding feed events...');

    const feedEvents: Partial<FeedEvent>[] = [];

    for (let i = 0; i < 20; i++) {
      const feedEvent: Partial<FeedEvent> = {
        id: this.getRandomUuid(),
        confidence: this.getRandomFloat(0.1, 1.0, 3),
        createdAt: this.getRandomDate(),
        updatedAt: new Date(),
        imageUrl: this.getRandomImageUrl(),
        croppedImageUrl: this.getRandomBoolean()
          ? this.getRandomImageUrl()
          : undefined,
        isAppropriate: this.getRandomBoolean(),
        source: this.getRandomEnumValue(Source),
        status: this.getRandomBoolean()
          ? this.getRandomEnumValue(Status)
          : undefined,
      };

      feedEvents.push(feedEvent);
    }

    const feedEventRepository = this.dataSource.getRepository(FeedEvent);
    await feedEventRepository.save(feedEvents);

    this.logger.info({ count: feedEvents.length }, 'Seeded feed events');
  }

  async clear(): Promise<void> {
    this.logger.info('Clearing feed events...');
    await this.clearTable('feed_event');
    this.logger.info('Cleared feed events');
  }

  async drop(): Promise<void> {
    this.logger.info('Dropping feed_event table...');
    await this.dropTable('feed_event');
    this.logger.info('Dropped feed_event table');
  }
}
