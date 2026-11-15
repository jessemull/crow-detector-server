import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { createLogger } from 'src/common/logger/logger.config';
import { AnimalDetectionResult } from 'src/common/types';
import { AnimalPhotoMediaType, ClaudeService } from './claude.service';

@Injectable()
export class DetectionImageProcessingService {
  private readonly logger = createLogger(DetectionImageProcessingService.name);
  private readonly s3: S3Client;

  constructor(
    private readonly configService: ConfigService,
    private readonly claudeService: ClaudeService,
  ) {
    const region = this.configService.get<string>('awsRegion') || 'us-west-2';

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
      // Amazon's label list called a raccoon a cat, so the photo goes to Haiku.
      const image = await this.readImage(bucket, key);
      const result = await this.claudeService.analyzeAnimalPhoto(
        image,
        this.mediaType(key),
      );

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

  private async readImage(bucket: string, key: string): Promise<Buffer> {
    try {
      const object = await this.s3.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
      );
      if (!object.Body) {
        throw new Error('Image body was empty');
      }
      return Buffer.from(await object.Body.transformToByteArray());
    } catch (error) {
      this.logger.error(
        `Failed to read image: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  private mediaType(key: string): AnimalPhotoMediaType {
    const lower = key.toLowerCase();
    if (lower.endsWith('.png')) {
      return 'image/png';
    }
    if (lower.endsWith('.gif')) {
      return 'image/gif';
    }
    if (lower.endsWith('.webp')) {
      return 'image/webp';
    }
    return 'image/jpeg';
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
