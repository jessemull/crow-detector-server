import { ConfigService } from '@nestjs/config';
import { BadRequestException, Injectable } from '@nestjs/common';
import {
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3ClientOptions } from 'src/common/aws/client-options';
import { Source, S3Metadata } from 'src/common/types';
import { createLogger } from 'src/common/logger/logger.config';

@Injectable()
export class S3MetadataService {
  private readonly logger = createLogger(S3MetadataService.name);
  private readonly s3: S3Client;

  constructor(private readonly configService: ConfigService) {
    const region = this.configService.get<string>('awsRegion') || 'us-west-2';
    this.s3 = new S3Client(s3ClientOptions(region));
  }

  async extractMetadataFromUrl(imageUrl: string): Promise<S3Metadata> {
    this.logger.info('Parsing S3 object reference');

    let url: URL;
    try {
      url = new URL(imageUrl);
    } catch {
      throw new BadRequestException('Invalid S3 URL format');
    }

    const hostnameParts = url.hostname.split('.');
    if (
      hostnameParts.length < 4 ||
      !hostnameParts[1]?.startsWith('s3') ||
      url.pathname.length < 2
    ) {
      throw new BadRequestException('Invalid S3 URL format');
    }

    const bucket = hostnameParts[0];
    const configured = this.configService.get<string>('s3BucketName');
    if (configured && bucket !== configured) {
      throw new BadRequestException(
        'Image URL must use the configured S3 bucket',
      );
    }

    const key = decodeURIComponent(url.pathname.substring(1));
    try {
      return await this.extractMetadataFromS3Object(bucket, key);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      if (error instanceof Error && isKeyFormatError(error.message)) {
        throw new BadRequestException(error.message);
      }
      this.logger.error(
        `Failed to read S3 object metadata: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
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
      // Feed images: feed/{timestamp}-{filename}...

      filename = pathParts[1];
    } else if (type === 'detection' && pathParts.length >= 3) {
      // Detection images: detection/{feedEventId}/{timestamp}-{filename}...

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

    const rawTimestamp = parseInt(timestampMatch[1], 10);
    // New keys use Date.now() (13 digits). Older keys used epoch seconds.
    const timestamp =
      rawTimestamp >= 1_000_000_000_000 ? rawTimestamp : rawTimestamp * 1000;
    this.logger.info(
      `Extracted timestamp: ${rawTimestamp} (stored as ${timestamp} ms)`,
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
      ...(feedEventId ? { feedEventId } : {}),
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
    const metadata = await this.getObjectMetadata(bucket, key);
    if (metadata.ContentLength === undefined) {
      throw new Error(`S3 object ${key} has no content length`);
    }
    return metadata.ContentLength;
  }

  /** Short-lived read URL. Callers store the object key, not this URL. */
  async presignGet(
    key: string,
    allowedPrefix: string,
    expiresInSeconds = 900,
  ): Promise<string> {
    if (!isAllowedObjectKey(key, allowedPrefix)) {
      throw new Error(`Refusing to presign a key outside ${allowedPrefix}`);
    }
    const bucket = this.configService.get<string>('s3BucketName');
    if (!bucket) {
      throw new Error('s3BucketName (S3_BUCKET_NAME) is required');
    }
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }
}

function isKeyFormatError(message: string): boolean {
  return (
    message.startsWith('Invalid S3 key') ||
    message.startsWith('Could not extract timestamp')
  );
}

export function isAllowedObjectKey(
  key: string,
  allowedPrefix: string,
): boolean {
  return (
    key.startsWith(allowedPrefix) &&
    !key.includes('..') &&
    !key.includes('://') &&
    !key.includes('\\')
  );
}
