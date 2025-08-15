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

export interface FeedResponse {
  data: FeedEvent | null;
  message: string;
}
