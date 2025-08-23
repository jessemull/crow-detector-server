import { DetectionEvent } from 'src/detection';

export interface DetectedAnimal {
  name: string;
  confidence: number;
  count: number;
}

export interface AnimalAnalysisResult {
  hasAnimals: boolean;
  crowCount: number;
  animalCount: number;
  detectedAnimals: DetectedAnimal[];
}

export interface AnimalDetectionResult {
  hasAnimals: boolean;
  crowCount: number;
  animalCount: number;
  detectedAnimals: DetectedAnimal[];
  processingDuration: number;
}

export interface RekognitionLabel {
  Name?: string;
  Confidence?: number;
  Instances?: Array<{ BoundingBox?: any; Confidence?: number }>;
}

export interface RekognitionLabelsResult {
  Labels?: RekognitionLabel[];
}

export interface DetectionResponse {
  data: DetectionEvent | null;
  message: string;
}
