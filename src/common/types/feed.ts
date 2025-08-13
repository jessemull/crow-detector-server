import { FeedEvent } from 'src/feed';

export enum Source {
  API = 'api',
  BUTTON = 'button',
  SCRIPT = 'script',
  TEST = 'test',
}

export enum Status {
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
}

export interface FeedResponse {
  data: FeedEvent | null;
  message: string;
}
