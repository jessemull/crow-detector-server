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
