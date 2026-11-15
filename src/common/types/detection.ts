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
  Instances?: Array<{
    BoundingBox?: {
      Height?: number;
      Left?: number;
      Top?: number;
      Width?: number;
    };
    Confidence?: number;
  }>;
  Parents?: Array<{ Name?: string }>;
}

export interface RekognitionLabelsResult {
  Labels?: RekognitionLabel[];
}

/** API envelope — keep entity-free to avoid common/types ↔ entity cycles. */
export interface DetectionResponse {
  data: unknown;
  message: string;
}
