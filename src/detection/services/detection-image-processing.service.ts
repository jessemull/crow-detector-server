import { ConfigService } from '@nestjs/config';
import {
  DetectLabelsCommand,
  RekognitionClient,
} from '@aws-sdk/client-rekognition';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { createLogger } from 'src/common/logger/logger.config';

export interface AnimalDetectionResult {
  hasAnimals: boolean;
  crowCount: number;
  animalCount: number;
  detectedAnimals: string[];
  confidence: number;
  processingDuration: number;
}

@Injectable()
export class DetectionImageProcessingService {
  private readonly logger = createLogger(DetectionImageProcessingService.name);
  private readonly rekognition: RekognitionClient;
  private readonly s3: S3Client;

  constructor(private readonly configService: ConfigService) {
    const region = this.configService.get<string>('AWS_REGION') || 'us-west-2';

    this.rekognition = new RekognitionClient({
      region,
    });

    this.s3 = new S3Client({
      region,
    });
  }

  async processImage(
    bucket: string,
    key: string,
  ): Promise<AnimalDetectionResult> {
    const startTime = Date.now();

    this.logger.info(`Starting animal detection for s3://${bucket}/${key}`);

    try {
      // Step 1: Detect labels in the image...

      const labels = await this.detectLabels(bucket, key);

      // Step 2: Analyze results for animals...

      const result = this.analyzeAnimalDetection(labels);

      // Step 3: If no animals detected, delete the image...

      if (!result.hasAnimals) {
        await this.deleteImage(bucket, key);
        this.logger.info(
          `No animals detected, deleted image s3://${bucket}/${key}`,
        );
      }

      const processingDuration = Date.now() - startTime;
      this.logger.info(`Animal detection completed in ${processingDuration}ms`);

      return {
        ...result,
        processingDuration,
      };
    } catch (error) {
      this.logger.error(
        `Animal detection failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  private async detectLabels(
    bucket: string,
    key: string,
  ): Promise<{ Labels?: Array<{ Name?: string; Confidence?: number }> }> {
    const command = new DetectLabelsCommand({
      Image: {
        S3Object: {
          Bucket: bucket,
          Name: key,
        },
      },
      MaxLabels: 100,
      MinConfidence: 70,
    });

    try {
      const result = await this.rekognition.send(command);
      return result;
    } catch (error) {
      this.logger.error(
        `Label detection failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  private analyzeAnimalDetection(labelsResult: {
    Labels?: Array<{ Name?: string; Confidence?: number }>;
  }): Omit<AnimalDetectionResult, 'processingDuration'> {
    const labels = labelsResult.Labels || [];

    // Define animal categories...

    const animalLabels = [
      'Animal',
      'Bird',
      'Mammal',
      'Reptile',
      'Amphibian',
      'Fish',
      'Crow',
      'Raven',
      'Blackbird',
      'Bird of Prey',
      'Raptor',
      'Dog',
      'Cat',
      'Squirrel',
      'Raccoon',
      'Deer',
      'Fox',
      'Coyote',
      'Rabbit',
      'Hare',
      'Mouse',
      'Rat',
      'Chipmunk',
      'Groundhog',
    ];

    const detectedAnimals: string[] = [];

    let crowCount = 0;
    let animalCount = 0;
    let maxConfidence = 0;

    for (const label of labels) {
      if (label.Name && label.Confidence) {
        maxConfidence = Math.max(maxConfidence, label.Confidence);

        // Check if it's an animal...
        const labelName = label.Name;
        if (
          animalLabels.some((animalLabel) =>
            labelName.toLowerCase().includes(animalLabel.toLowerCase()),
          )
        ) {
          detectedAnimals.push(labelName);

          // Count crows specifically...
          if (
            labelName.toLowerCase().includes('crow') ||
            labelName.toLowerCase().includes('raven') ||
            labelName.toLowerCase().includes('blackbird')
          ) {
            crowCount++;
          }

          animalCount++;
        }
      }
    }

    return {
      hasAnimals: animalCount > 0,
      crowCount,
      animalCount,
      detectedAnimals,
      confidence: maxConfidence,
    };
  }

  private async deleteImage(bucket: string, key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({ Bucket: bucket, Key: key });
      await this.s3.send(command);
      this.logger.info(`Deleted image s3://${bucket}/${key}`);
    } catch (error) {
      this.logger.error(
        `Failed to delete image: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
