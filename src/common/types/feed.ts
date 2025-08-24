import { FeedEvent } from 'src/feed';

export enum Source {
  API = 'API',
  BUTTON = 'BUTTON',
  SCRIPT = 'SCRIPT',
  TEST = 'TEST',
}

export enum Status {
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
}

export enum FeedEventStatus {
  PENDING = 'PENDING',
  FEEDING = 'FEEDING',
  FEEDING_COMPLETE = 'FEEDING_COMPLETE',
  PHOTO_TAKEN = 'PHOTO_TAKEN',
  COMPLETE = 'COMPLETE',
}

export enum ProcessingStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export interface FeedResponse {
  data: FeedEvent | null;
  message: string;
}
