import { Source } from './feed';

export enum ImageFormat {
  JPG = 'jpg',
  JPEG = 'jpeg',
  PNG = 'png',
  GIF = 'gif',
  BMP = 'bmp',
  WEBP = 'webp',
}

export interface FaceDetectionResult {
  faceDetected: boolean;
  boundingBox?: {
    Width: number;
    Height: number;
    Left: number;
    Top: number;
  };
}

export interface ContentModerationResult {
  isAppropriate: boolean;
  labels: string[];
  confidence: number;
}

export interface ImageProcessingResult {
  faceDetection: FaceDetectionResult;
  contentModeration: ContentModerationResult;
  croppedImageBuffer?: Buffer;
  processingDuration: number;
}

export interface S3Metadata {
  bucket: string;
  key: string;
  source: Source;
  timestamp: number;
  type: 'feed' | 'detection';
}
