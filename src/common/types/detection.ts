import { DetectionEvent } from 'src/detection';

export interface DetectionResponse {
  data: DetectionEvent | null;
  message: string;
}