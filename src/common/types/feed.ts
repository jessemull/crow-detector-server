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

/** API envelope — keep entity-free to avoid common/types ↔ entity cycles. */
export interface FeedResponse {
  data: unknown;
  message: string;
}
