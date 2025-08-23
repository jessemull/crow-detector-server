import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import { Source, S3Metadata } from 'src/common/types';
import { createLogger } from 'src/common/logger/logger.config';

@Injectable()
export class S3MetadataService {
  private readonly logger = createLogger(S3MetadataService.name);
  private readonly s3: S3Client;

  constructor(private readonly configService: ConfigService) {
    this.s3 = new S3Client({
      region: this.configService.get<string>('AWS_REGION') || 'us-west-2',
    });
  }

  async extractMetadataFromUrl(imageUrl: string): Promise<S3Metadata> {
    try {
      // Parse S3 URL: https://bucket-name.s3.region.amazonaws.com/key...

      this.logger.info(`Parsing S3 URL: ${imageUrl}`);

      const url = new URL(imageUrl);
      this.logger.info(`URL parsed successfully: ${url.hostname}`);

      const hostnameParts = url.hostname.split('.');
      this.logger.info(`Hostname parts: ${JSON.stringify(hostnameParts)}`);

      if (hostnameParts.length < 4 || !hostnameParts[1].startsWith('s3')) {
        this.logger.error(
          `Invalid hostname format: length=${hostnameParts.length}, s3 part=${hostnameParts[1]}`,
        );
        throw new Error('Invalid S3 URL format');
      }

      const bucket = hostnameParts[0];
      const key = url.pathname.substring(1); // Remove leading slash

      this.logger.info(`Extracted bucket: ${bucket}, key: ${key}`);

      // Extract metadata from S3 object and key path...

      return await this.extractMetadataFromS3Object(bucket, key);
    } catch (error) {
      this.logger.error(
        `Failed to extract metadata from URL: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new Error('Invalid S3 URL format');
    }
  }

  private async extractMetadataFromS3Object(
    bucket: string,
    key: string,
  ): Promise<S3Metadata> {
    // Get S3 object metadata first...

    this.logger.info(
      `Getting S3 object metadata for bucket: ${bucket}, key: ${key}`,
    );
    const s3Metadata = await this.getObjectMetadata(bucket, key);
    this.logger.info(
      `S3 metadata retrieved: ${JSON.stringify(s3Metadata.Metadata)}`,
    );

    // Extract from key for path type and timestamp...

    const pathParts = key.split('/');
    this.logger.info(`Path parts: ${JSON.stringify(pathParts)}`);

    if (pathParts.length < 2) {
      this.logger.error(
        `Invalid key format: ${key}, parts: ${pathParts.length}`,
      );
      throw new Error('Invalid S3 key format');
    }

    const type = pathParts[0] as 'feed' | 'detection';

    let feedEventId: string | undefined;
    let filename: string;

    if (type === 'feed' && pathParts.length === 2) {
      // Feed images: feed/{timestamp}-{filename}
      filename = pathParts[1];
    } else if (type === 'detection' && pathParts.length >= 3) {
      // Detection images: detection/{feedEventId}/{timestamp}-{filename}
      feedEventId = pathParts[1];
      filename = pathParts[2];
    } else {
      this.logger.error(
        `Invalid key format for type ${type}: ${key}, parts: ${pathParts.length}`,
      );
      throw new Error('Invalid S3 key format');
    }

    this.logger.info(
      `Extracted type: ${type}, feedEventId: ${feedEventId || 'N/A'}, filename: ${filename}`,
    );

    // Extract timestamp from filename: 1755884038592-test-image.jpg...

    const timestampMatch = filename.match(/^(\d+)-/);
    if (!timestampMatch) {
      this.logger.error(
        `Could not extract timestamp from filename: ${filename}`,
      );
      throw new Error('Could not extract timestamp from filename');
    }

    const timestampSeconds = parseInt(timestampMatch[1], 10);
    const timestamp = timestampSeconds * 1000; // Convert seconds to milliseconds
    this.logger.info(
      `Extracted timestamp: ${timestampSeconds} seconds = ${timestamp} milliseconds`,
    );

    // Extract source from S3 metadata (uploaded with the image)...

    let source: Source = Source.BUTTON; // Default fallback

    if (s3Metadata.Metadata && s3Metadata.Metadata['x-amz-meta-source']) {
      const sourceFromMeta =
        s3Metadata.Metadata['x-amz-meta-source'].toUpperCase();
      if (Object.values(Source).includes(sourceFromMeta as Source)) {
        source = sourceFromMeta as Source;
      }
    }

    this.logger.info(
      `Final result: bucket=${bucket}, key=${key}, source=${source}, timestamp=${timestamp}, type=${type}`,
    );

    return {
      bucket,
      key,
      source,
      timestamp,
      type,
    };
  }

  async getObjectMetadata(
    bucket: string,
    key: string,
  ): Promise<{
    ContentLength?: number;
    Metadata?: Record<string, string>;
  }> {
    try {
      const command = new HeadObjectCommand({ Bucket: bucket, Key: key });
      const result = await this.s3.send(command);
      return result;
    } catch (error) {
      this.logger.error(
        `Failed to get S3 object metadata: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  async getObjectSize(bucket: string, key: string): Promise<number> {
    try {
      const metadata = await this.getObjectMetadata(bucket, key);
      return metadata.ContentLength || 0;
    } catch (error) {
      this.logger.error(
        `Failed to get object size: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 0;
    }
  }
}
