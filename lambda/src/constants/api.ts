export function requireApiBaseUrl(): string {
  const value = process.env.API_BASE_URL;
  if (!value) {
    throw new Error('API_BASE_URL is required');
  }
  return value;
}

export const DETECTION_ENDPOINT =
  process.env.DETECTION_ENDPOINT || '/detection';

export const FEED_ENDPOINT = process.env.FEED_ENDPOINT || '/feed';

export const API_TIMEOUT_MS = 10000;

export const USER_AGENT = 'crow-detector-s3-lambda/1.0.0';
