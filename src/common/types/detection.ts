import { DetectionEvent } from 'src/detection';

export interface DetectedAnimal {
  name: string;
  confidence: number;
  count: number;
}

export interface DetectionResponse {
  data: DetectionEvent | null;
  message: string;
}
