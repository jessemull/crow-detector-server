import { ConfigService } from '@nestjs/config';
import {
  DetectLabelsCommand,
  RekognitionClient,
} from '@aws-sdk/client-rekognition';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { createLogger } from 'src/common/logger/logger.config';
import {
  AnimalDetectionResult,
  DetectedAnimal,
  RekognitionLabelsResult,
  RekognitionLabel,
} from 'src/common/types';

@Injectable()
export class DetectionImageProcessingService {
  private readonly logger = createLogger(DetectionImageProcessingService.name);
  private readonly rekognition: RekognitionClient;
  private readonly s3: S3Client;

  constructor(private readonly configService: ConfigService) {
    const region = this.configService.get<string>('awsRegion') || 'us-west-2';

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

      // Parent labels describe the same creature. Animal + Bird + Crow
      // is one crow, so the stored count comes from the labels directly.

      const result = this.countAnimals(labels.Labels || []);

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
  ): Promise<RekognitionLabelsResult> {
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

  private countAnimals(
    labels: RekognitionLabel[],
  ): Omit<AnimalDetectionResult, 'processingDuration'> {
    const named = labels.filter(
      (label) => label.Name && label.Confidence !== undefined,
    );
    const crowLabels = named.filter((label) => this.isCrowLabel(label.Name!));
    const specificLabels = named.filter(
      (label) =>
        !this.isBroadLabel(label.Name!) &&
        !this.isCrowLabel(label.Name!) &&
        this.hasAnimalParent(label),
    );

    const detectedAnimals: DetectedAnimal[] = [];
    let animalCount = 0;
    let crowCount = 0;

    if (crowLabels.length > 0) {
      const crow = this.representative(crowLabels);
      detectedAnimals.push(crow);
      animalCount += crow.count;
      crowCount += crow.count;
    }

    for (const label of this.collapseNestedNames(specificLabels)) {
      const count = this.instanceCount(label);
      detectedAnimals.push({
        name: label.Name!,
        confidence: label.Confidence!,
        count,
      });
      animalCount += count;
    }

    if (specificLabels.length === 0 && crowLabels.length === 0) {
      const birdLabels = this.labelsNamed(named, [
        'bird',
        'avian',
        'flying animal',
      ]);
      const mammalLabels = this.labelsNamed(named, ['mammal', 'furry animal']);

      for (const branchLabels of [birdLabels, mammalLabels]) {
        if (branchLabels.length === 0) {
          continue;
        }
        const chosen = this.representative(branchLabels);
        detectedAnimals.push(chosen);
        animalCount += chosen.count;
      }

      if (birdLabels.length === 0 && mammalLabels.length === 0) {
        const genericLabels = this.labelsNamed(named, [
          'animal',
          'wildlife',
          'pet',
          'farm animal',
        ]);
        if (genericLabels.length > 0) {
          const chosen = this.representative(genericLabels);
          detectedAnimals.push(chosen);
          animalCount += chosen.count;
        }
      }
    } else {
      const uncoveredBranches = [
        {
          names: ['bird', 'avian', 'flying animal'],
          covered: crowLabels.length > 0,
        },
        {
          names: ['mammal', 'furry animal'],
          covered: specificLabels.some((label) =>
            this.hasParent(label, ['mammal', 'furry animal', 'animal']),
          ),
        },
      ];

      for (const branch of uncoveredBranches) {
        if (branch.covered) {
          continue;
        }
        const branchLabels = named.filter((label) =>
          branch.names.includes(label.Name!.toLowerCase()),
        );
        if (branchLabels.length === 0) {
          continue;
        }
        const chosen = this.representative(branchLabels);
        detectedAnimals.push(chosen);
        animalCount += chosen.count;
      }
    }

    return {
      hasAnimals: animalCount > 0,
      crowCount,
      animalCount,
      detectedAnimals,
    };
  }

  private labelsNamed(
    labels: RekognitionLabel[],
    names: string[],
  ): RekognitionLabel[] {
    return labels.filter((label) => names.includes(label.Name!.toLowerCase()));
  }

  private representative(labels: RekognitionLabel[]): DetectedAnimal {
    const parentNames = new Set(
      labels.flatMap((label) =>
        (label.Parents || []).map((parent) => parent.Name?.toLowerCase()),
      ),
    );
    const leaves = labels.filter(
      (label) => !parentNames.has(label.Name?.toLowerCase()),
    );
    const candidates = leaves.length > 0 ? leaves : labels;
    const best = candidates.reduce((current, label) =>
      (label.Confidence || 0) > (current.Confidence || 0) ? label : current,
    );
    return {
      name: best.Name!,
      confidence: best.Confidence!,
      count: Math.max(...labels.map((label) => this.instanceCount(label))),
    };
  }

  private instanceCount(label: RekognitionLabel): number {
    const instances = label.Instances?.length ?? 0;
    return instances > 0 ? instances : 1;
  }

  private isBroadLabel(name: string): boolean {
    return [
      'animal',
      'wildlife',
      'pet',
      'farm animal',
      'bird',
      'avian',
      'flying animal',
      'mammal',
      'furry animal',
    ].includes(name.toLowerCase());
  }

  private isCrowLabel(name: string): boolean {
    const normalized = name.toLowerCase();
    return ['crow', 'raven', 'blackbird', 'corvid'].some((term) =>
      normalized.includes(term),
    );
  }

  private hasAnimalParent(label: RekognitionLabel): boolean {
    return this.hasParent(label, [
      'animal',
      'wildlife',
      'pet',
      'farm animal',
      'bird',
      'avian',
      'flying animal',
      'mammal',
      'furry animal',
    ]);
  }

  private hasParent(label: RekognitionLabel, names: string[]): boolean {
    return (label.Parents || []).some(
      (parent) => parent.Name && names.includes(parent.Name.toLowerCase()),
    );
  }

  private collapseNestedNames(labels: RekognitionLabel[]): RekognitionLabel[] {
    const kept: RekognitionLabel[] = [];
    const sorted = [...labels].sort(
      (left, right) => right.Name!.length - left.Name!.length,
    );

    for (const label of sorted) {
      const name = label.Name!.toLowerCase();
      const nestsWithKept = kept.some((existing) => {
        const existingName = existing.Name!.toLowerCase();
        return existingName.includes(name) || name.includes(existingName);
      });
      if (!nestsWithKept) {
        kept.push(label);
      }
    }

    return kept;
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
