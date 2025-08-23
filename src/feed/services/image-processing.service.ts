import {
  RekognitionClient,
  DetectModerationLabelsCommand,
  DetectFacesCommand,
} from '@aws-sdk/client-rekognition';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import {
  FaceDetectionResult,
  ContentModerationResult,
  ImageProcessingResult,
} from 'src/common/types';
import { createLogger } from 'src/common/logger/logger.config';

@Injectable()
export class ImageProcessingService {
  private readonly logger = createLogger(ImageProcessingService.name);
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
  ): Promise<ImageProcessingResult> {
    const startTime = Date.now();

    if (key.startsWith('processed/')) {
      this.logger.warn(
        `Skipping processing for already processed image: ${key}`,
      );
      return {
        faceDetection: { faceDetected: false },
        contentModeration: {
          isAppropriate: true,
          labels: [],
          confidence: 0,
        },
        processingDuration: Date.now() - startTime,
      };
    }

    this.logger.info(`Starting image processing for s3://${bucket}/${key}`);

    try {
      // Step 1: Content moderation check...

      const contentModeration = await this.checkContentModeration(bucket, key);

      if (!contentModeration.isAppropriate) {
        this.logger.warn(
          `Image rejected due to inappropriate content: ${contentModeration.labels.join(', ')}`,
        );
        return {
          faceDetection: { faceDetected: false },
          contentModeration,
          processingDuration: Date.now() - startTime,
        };
      }

      // Step 2: Face detection...

      const faceDetection = await this.detectFaces(bucket, key);

      // Step 3: Download and crop image if face detected...

      let croppedImageBuffer: Buffer | undefined;

      if (faceDetection.faceDetected && faceDetection.boundingBox) {
        croppedImageBuffer = await this.cropImageToFace(
          bucket,
          key,
          faceDetection.boundingBox,
        );
      }

      const processingDuration = Date.now() - startTime;
      this.logger.info(`Image processing completed in ${processingDuration}ms`);

      return {
        faceDetection,
        contentModeration,
        croppedImageBuffer,
        processingDuration,
      };
    } catch (error) {
      this.logger.error(
        `Image processing failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  private async checkContentModeration(
    bucket: string,
    key: string,
  ): Promise<ContentModerationResult> {
    const command = new DetectModerationLabelsCommand({
      Image: {
        S3Object: {
          Bucket: bucket,
          Name: key,
        },
      },
      MinConfidence: 70,
    });

    try {
      const result = await this.rekognition.send(command);

      const inappropriateLabels = [
        'Explicit Nudity',
        'Violence',
        'Hate Symbols',
        'Drugs',
        'Gambling',
      ];

      const foundLabels =
        result.ModerationLabels?.map((label) => label.Name) || [];
      const isAppropriate = !foundLabels.some(
        (label) => label !== undefined && inappropriateLabels.includes(label),
      );

      return {
        isAppropriate,
        labels: foundLabels.filter(
          (label): label is string => label !== undefined,
        ),
        confidence: result.ModerationLabels?.[0]?.Confidence || 0,
      };
    } catch (error) {
      this.logger.error(
        `Content moderation check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Default to false for security - if we can't verify content is safe, reject it...

      return {
        isAppropriate: false,
        labels: ['ModerationCheckFailed'],
        confidence: 0,
      };
    }
  }

  private async detectFaces(
    bucket: string,
    key: string,
  ): Promise<FaceDetectionResult> {
    const command = new DetectFacesCommand({
      Image: {
        S3Object: {
          Bucket: bucket,
          Name: key,
        },
      },
      Attributes: ['DEFAULT'],
    });

    try {
      const result = await this.rekognition.send(command);

      if (result.FaceDetails && result.FaceDetails.length > 0) {
        const face = result.FaceDetails[0];
        if (
          face.BoundingBox &&
          face.BoundingBox.Height !== undefined &&
          face.BoundingBox.Width !== undefined &&
          face.BoundingBox.Left !== undefined &&
          face.BoundingBox.Top !== undefined
        ) {
          return {
            faceDetected: true,
            boundingBox: {
              Height: face.BoundingBox.Height,
              Width: face.BoundingBox.Width,
              Left: face.BoundingBox.Left,
              Top: face.BoundingBox.Top,
            },
          };
        }
      }

      return { faceDetected: false };
    } catch (error) {
      // Default to false for safety - if we can't detect faces, assume none detected...

      this.logger.error(
        `Face detection failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { faceDetected: false };
    }
  }

  private async cropImageToFace(
    bucket: string,
    key: string,
    boundingBox: {
      Width: number;
      Height: number;
      Left: number;
      Top: number;
    },
  ): Promise<Buffer> {
    try {
      // Download image from S3...

      const command = new GetObjectCommand({ Bucket: bucket, Key: key });
      const s3Object = await this.s3.send(command);
      const imageBuffer = Buffer.from(
        await s3Object.Body!.transformToByteArray(),
      );

      // Get image metadata...

      const metadata = await sharp(imageBuffer).metadata();
      const { width: imageWidth, height: imageHeight } = metadata;

      if (!imageWidth || !imageHeight) {
        throw new Error('Could not determine image dimensions');
      }

      // Calculate crop coordinates...

      const left = Math.round(boundingBox.Left * imageWidth);
      const top = Math.round(boundingBox.Top * imageHeight);
      const width = Math.round(boundingBox.Width * imageWidth);
      const height = Math.round(boundingBox.Height * imageHeight);

      // Add padding around face (20% on each side)...

      const paddingX = Math.round(width * 0.2);
      const paddingY = Math.round(height * 0.2);

      const cropLeft = Math.max(0, left - paddingX);
      const cropTop = Math.max(0, top - paddingY);
      const cropWidth = Math.min(imageWidth - cropLeft, width + 2 * paddingX);
      const cropHeight = Math.min(imageHeight - cropTop, height + 2 * paddingY);

      // Crop and resize image...

      const croppedBuffer = await sharp(imageBuffer)
        .extract({
          left: cropLeft,
          top: cropTop,
          width: cropWidth,
          height: cropHeight,
        })
        .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();

      this.logger.info(
        `Image cropped to face: ${cropWidth}x${cropHeight} -> 800x800`,
      );
      return croppedBuffer;
    } catch (error) {
      this.logger.error(
        `Image cropping failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  async uploadProcessedImage(
    bucket: string,
    key: string,
    imageBuffer: Buffer,
  ): Promise<string> {
    // Extract the base filename without extension
    const pathParts = key.split('/');
    const filename = pathParts[pathParts.length - 1];
    const baseName = filename.replace(/\.[^/.]+$/, ''); // Remove file extension

    // Create processed key in a separate 'processed' directory
    const processedKey = `processed/${baseName}_cropped.jpg`;

    try {
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: processedKey,
        Body: imageBuffer,
        ContentType: 'image/jpeg',
        ServerSideEncryption: 'AES256',
      });
      await this.s3.send(command);

      const region =
        this.configService.get<string>('AWS_REGION') || 'us-west-2';
      const processedUrl = `https://${bucket}.s3.${region}.amazonaws.com/${processedKey}`;
      this.logger.info(`Processed image uploaded: ${processedUrl}`);

      return processedUrl;
    } catch (error) {
      this.logger.error(
        `Failed to upload processed image: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
