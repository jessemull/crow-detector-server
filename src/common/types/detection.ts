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
