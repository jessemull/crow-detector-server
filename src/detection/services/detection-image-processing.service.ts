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

      // Amazon's boxes are the count. Overlapping boxes are one animal,
      // and names that describe that same animal are not counted again.

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
    const animalLabels = labels.filter(
      (label) =>
        label.Name &&
        label.Confidence !== undefined &&
        (this.isBroadLabel(label.Name) ||
          this.isCrowLabel(label.Name) ||
          this.hasAnimalParent(label)),
    );
    const bodies = this.animalBodies(animalLabels);
    const grouped = new Map<string, DetectedAnimal>();

    for (const body of bodies) {
      const existing = grouped.get(body.name);
      if (existing) {
        existing.count += 1;
        existing.confidence = Math.max(existing.confidence, body.confidence);
        continue;
      }
      grouped.set(body.name, {
        name: body.name,
        confidence: body.confidence,
        count: 1,
      });
    }

    const detectedAnimals = [...grouped.values()];
    const animalCount = bodies.length;
    const crowCount = bodies.filter((body) => body.isCrow).length;

    return {
      hasAnimals: animalCount > 0,
      crowCount,
      animalCount,
      detectedAnimals,
    };
  }

  private animalBodies(labels: RekognitionLabel[]): Array<{
    confidence: number;
    isCrow: boolean;
    name: string;
  }> {
    const boxed: Array<{ box: AnimalBox; label: RekognitionLabel }> = [];
    const unboxed: RekognitionLabel[] = [];

    for (const label of labels) {
      const boxes = this.animalBoxes(label);
      if (boxes.length === 0) {
        unboxed.push(label);
        continue;
      }
      for (const box of boxes) {
        boxed.push({ box, label });
      }
    }

    const clusters = this.clusterBoxes(boxed);

    if (clusters.length === 0) {
      return unboxed.length === 0 ? [] : [this.describeBody(unboxed)];
    }

    return clusters.map((cluster) => {
      const labelsInCluster = cluster.map((entry) => entry.label);
      for (const label of unboxed) {
        const matchesOneCluster =
          clusters.filter((candidate) =>
            candidate.some((entry) =>
              this.isMoreSpecificThan(label, entry.label),
            ),
          ).length === 1;
        if (
          matchesOneCluster &&
          cluster.some((entry) => this.isMoreSpecificThan(label, entry.label))
        ) {
          labelsInCluster.push(label);
        }
      }
      return this.describeBody(labelsInCluster);
    });
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

  private animalBoxes(label: RekognitionLabel): AnimalBox[] {
    return (label.Instances || []).flatMap((instance) => {
      const box = instance.BoundingBox;
      if (
        !box ||
        box.Left === undefined ||
        box.Top === undefined ||
        box.Width === undefined ||
        box.Height === undefined ||
        box.Width <= 0 ||
        box.Height <= 0
      ) {
        return [];
      }
      return [
        {
          height: box.Height,
          left: box.Left,
          top: box.Top,
          width: box.Width,
        },
      ];
    });
  }

  private clusterBoxes(
    boxed: Array<{ box: AnimalBox; label: RekognitionLabel }>,
  ): Array<Array<{ box: AnimalBox; label: RekognitionLabel }>> {
    const parent = boxed.map((_, index) => index);
    const find = (index: number): number => {
      if (parent[index] !== index) {
        parent[index] = find(parent[index]);
      }
      return parent[index];
    };
    const unite = (left: number, right: number): void => {
      const leftRoot = find(left);
      const rightRoot = find(right);
      if (leftRoot !== rightRoot) {
        parent[rightRoot] = leftRoot;
      }
    };

    for (let left = 0; left < boxed.length; left += 1) {
      for (let right = left + 1; right < boxed.length; right += 1) {
        if (this.sameBody(boxed[left].box, boxed[right].box)) {
          unite(left, right);
        }
      }
    }

    const groups = new Map<
      number,
      Array<{ box: AnimalBox; label: RekognitionLabel }>
    >();
    boxed.forEach((entry, index) => {
      const root = find(index);
      const group = groups.get(root) ?? [];
      group.push(entry);
      groups.set(root, group);
    });
    return [...groups.values()];
  }

  private sameBody(left: AnimalBox, right: AnimalBox): boolean {
    const overlapWidth =
      Math.min(left.left + left.width, right.left + right.width) -
      Math.max(left.left, right.left);
    const overlapHeight =
      Math.min(left.top + left.height, right.top + right.height) -
      Math.max(left.top, right.top);
    const overlap = Math.max(0, overlapWidth) * Math.max(0, overlapHeight);
    const minArea = Math.min(
      left.width * left.height,
      right.width * right.height,
    );
    return minArea > 0 && overlap / minArea >= 0.5;
  }

  private describeBody(labels: RekognitionLabel[]): {
    confidence: number;
    isCrow: boolean;
    name: string;
  } {
    const parentNames = new Set(
      labels.flatMap((label) =>
        (label.Parents || []).flatMap((parent) =>
          parent.Name ? [parent.Name.toLowerCase()] : [],
        ),
      ),
    );
    const leaves = labels.filter(
      (label) => !parentNames.has(label.Name!.toLowerCase()),
    );
    const pool = leaves.length > 0 ? leaves : labels;
    const best = pool.reduce((current, label) =>
      this.preferLabel(label, current) ? label : current,
    );
    return {
      confidence: best.Confidence!,
      isCrow: labels.some((label) => this.isCrowLabel(label.Name!)),
      name: best.Name!,
    };
  }

  private preferLabel(
    candidate: RekognitionLabel,
    current: RekognitionLabel,
  ): boolean {
    const candidateRank = this.nameRank(candidate.Name!);
    const currentRank = this.nameRank(current.Name!);
    if (candidateRank !== currentRank) {
      return candidateRank > currentRank;
    }
    return (candidate.Confidence || 0) > (current.Confidence || 0);
  }

  private nameRank(name: string): number {
    if (!this.isBroadLabel(name)) {
      return 2;
    }
    if (
      ['bird', 'avian', 'flying animal', 'mammal', 'furry animal'].includes(
        name.toLowerCase(),
      )
    ) {
      return 1;
    }
    return 0;
  }

  private isMoreSpecificThan(
    child: RekognitionLabel,
    parent: RekognitionLabel,
  ): boolean {
    return !!parent.Name && this.hasParent(child, [parent.Name.toLowerCase()]);
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

interface AnimalBox {
  height: number;
  left: number;
  top: number;
  width: number;
}
