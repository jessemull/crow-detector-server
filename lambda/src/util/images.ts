import { IMAGE_EXTENSIONS, RELEVANT_EVENTS } from '../constants';
import { ImageType } from '../types';

export function isImageFile(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lowerKey.endsWith(ext));
}

export function isRelevantEvent(eventName: string): boolean {
  return RELEVANT_EVENTS.includes(eventName as any);
}

export function getImageType(key: string): ImageType {
  if (key.startsWith('feed/')) {
    return 'feed';
  } else if (key.startsWith('detection/')) {
    return 'detection';
  } else {
    throw new Error(
      `Cannot determine image type from S3 key path: ${key}. Expected path to start with 'feed/' or 'detection/'`,
    );
  }
}
