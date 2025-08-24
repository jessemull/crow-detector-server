import { BaseSeeder } from './base-seeder';
import { FeedEvent } from '../../../src/feed/entity/feed-event.entity';
import {
  Source,
  Status,
  ProcessingStatus,
  FeedEventStatus,
} from '../../../src/common/types';
import { createLogger } from '../../../src/common/logger/logger.config';

export class FeedEventSeeder extends BaseSeeder {
  private logger = createLogger('FeedEventSeeder');

  async seed(): Promise<void> {
    this.logger.info('Seeding feed events...');

    const feedEvents: Partial<FeedEvent>[] = [];

    for (let i = 0; i < 20; i++) {
      const processingStatus = this.getRandomEnumValue(ProcessingStatus);
      const isAppropriate = this.getRandomBoolean();
      const faceDetected = this.getRandomBoolean();

      const originalImageSize = this.getRandomNumber(500000, 5000000); // 500KB - 5MB
      const processedImageSize =
        faceDetected && isAppropriate
          ? Math.floor(originalImageSize * this.getRandomFloat(0.3, 0.8, 2)) // 30-80% of original
          : undefined;

      const processingDuration = this.getRandomNumber(2000, 15000); // 2-15 seconds

      const moderationLabels = this.generateModerationLabels(isAppropriate);

      const faceBoundingBox = faceDetected
        ? JSON.stringify({
            Width: this.getRandomFloat(0.1, 0.4, 3),
            Height: this.getRandomFloat(0.1, 0.4, 3),
            Left: this.getRandomFloat(0.1, 0.6, 3),
            Top: this.getRandomFloat(0.1, 0.6, 3),
          })
        : undefined;

      const feedEvent: Partial<FeedEvent> = {
        id: this.getRandomUuid(),
        confidence: this.getRandomFloat(0.1, 1.0, 3),
        createdAt: this.getRandomDate(),
        updatedAt: new Date(),
        imageUrl: this.getRandomImageUrl(),
        croppedImageUrl:
          faceDetected && isAppropriate
            ? this.getRandomImageUrl().replace('.jpg', '_cropped.jpg')
            : undefined,
        isAppropriate,
        source: this.getRandomEnumValue(Source),
        status: this.getRandomBoolean()
          ? this.getRandomEnumValue(Status)
          : undefined,
        processingStatus,
        processingError:
          processingStatus === ProcessingStatus.FAILED
            ? 'Mock processing error for testing'
            : undefined,
        moderationLabels,
        faceDetected,
        faceBoundingBox,
        originalImageSize,
        processedImageSize,
        processingDuration,
        // Feeder status fields
        feedEventStatus: this.getRandomEnumValue(FeedEventStatus),
        feederTriggeredAt: this.getRandomBoolean()
          ? this.getRandomDate()
          : undefined,
        feedingCompletedAt: this.getRandomBoolean()
          ? this.getRandomDate()
          : undefined,
        photoTakenAt: this.getRandomBoolean()
          ? this.getRandomDate()
          : undefined,
        photoUrl: this.getRandomBoolean()
          ? this.getRandomImageUrl()
          : undefined,
      };

      feedEvents.push(feedEvent);
    }

    const feedEventRepository = this.dataSource.getRepository(FeedEvent);
    await feedEventRepository.save(feedEvents);

    this.logger.info({ count: feedEvents.length }, 'Seeded feed events');
  }

  private generateModerationLabels(isAppropriate: boolean): string {
    if (isAppropriate) {
      const safeLabels = ['Person', 'Face', 'Clothing', 'Outdoor', 'Nature'];
      const selectedLabels = this.getRandomArrayElements(safeLabels, 2, 4);
      return JSON.stringify(selectedLabels);
    } else {
      const unsafeLabels = ['Explicit Content', 'Violence', 'Inappropriate'];
      const selectedLabels = this.getRandomArrayElements(unsafeLabels, 1, 2);
      return JSON.stringify(selectedLabels);
    }
  }

  private getRandomArrayElements<T>(array: T[], min: number, max: number): T[] {
    const count = this.getRandomNumber(min, max);
    const shuffled = [...array].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
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
