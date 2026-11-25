import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateFeedImageUrlDto,
  CreateDetectionImageUrlDto,
  CreatePorchClipUrlDto,
  CreateFeederClipUrlDto,
  FEEDER_CLIP_CONTENT_TYPE,
  FEEDER_CLIP_MAX_BYTES,
} from '../dto';
import { FeedEvent } from '../../feed/entity/feed-event.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3ClientOptions } from 'src/common/aws/client-options';
import { FEEDER_OBJECT_KEY_MAX_LENGTH } from 'src/feeder/services/dispense-request.service';
import { logger } from 'src/common/logger/logger.config';

@Injectable()
export class UrlsService {
  private readonly s3Client: S3Client;
  private readonly bucketName: string;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(FeedEvent)
    private readonly feedEventRepository: Repository<FeedEvent>,
  ) {
    this.s3Client = new S3Client(
      s3ClientOptions(
        this.configService.get<string>('awsRegion') || 'us-west-2',
      ),
    );

    const bucketName = this.configService.get<string>('s3BucketName');

    if (!bucketName) {
      throw new Error('s3BucketName (S3_BUCKET_NAME) is required');
    }

    this.bucketName = bucketName;
  }

  async createFeedImageSignedUrl(createFeedImageUrlDto: CreateFeedImageUrlDto) {
    const { fileName, format, source, contentLength } = createFeedImageUrlDto;
    const safeName = this.sanitizeObjectFileName(
      fileName,
      'Invalid feed image file name',
    );

    const timestamp = Date.now();
    const key = `feed/${timestamp}-${safeName}.${format}`;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: this.getContentType(format),
      ContentLength: contentLength,
      ServerSideEncryption: 'AES256',
      Metadata: {
        'x-amz-meta-timestamp': timestamp.toString(),
        'x-amz-meta-source': source,
        'x-amz-meta-type': 'feed',
      },
    });

    try {
      const signedUrl = await getSignedUrl(
        this.s3Client,
        command,
        presignPutOptions(),
      );

      return {
        signedUrl,
        key,
        expiresAt: new Date(Date.now() + 900 * 1000).toISOString(),
        bucket: this.bucketName,
        metadata: {
          timestamp,
          source,
          type: 'feed',
        },
      };
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to generate feed image signed URL',
      );
      throw new InternalServerErrorException(
        'Failed to generate feed image signed URL',
      );
    }
  }

  async createDetectionImageSignedUrl(
    createDetectionImageUrlDto: CreateDetectionImageUrlDto,
  ) {
    const { fileName, format, contentLength } = createDetectionImageUrlDto;

    // Get the latest feed event ID from the database...

    const latestFeedEvents = await this.feedEventRepository.find({
      order: { createdAt: 'DESC' },
      take: 1,
    });

    const latestFeedEvent = latestFeedEvents[0];

    if (!latestFeedEvent) {
      throw new NotFoundException(
        'No feed events found. Please create a feed event first.',
      );
    }

    const feedEventId = latestFeedEvent.id;
    const timestamp = Date.now();
    const uniqueFileName = `${timestamp}-${fileName}`;
    const key = `detection/${feedEventId}/${uniqueFileName}.${format}`;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: this.getContentType(format),
      ContentLength: contentLength,
      ServerSideEncryption: 'AES256',
      Metadata: {
        'x-amz-meta-timestamp': timestamp.toString(),
        'x-amz-meta-feed-event-id': feedEventId,
        'x-amz-meta-type': 'detection',
      },
    });

    try {
      const signedUrl = await getSignedUrl(
        this.s3Client,
        command,
        presignPutOptions(),
      );

      return {
        signedUrl,
        key,
        expiresAt: new Date(Date.now() + 900 * 1000).toISOString(),
        bucket: this.bucketName,
        metadata: {
          timestamp,
          feedEventId,
          type: 'detection',
        },
      };
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to generate detection image signed URL',
      );
      throw new InternalServerErrorException(
        'Failed to generate detection image signed URL',
      );
    }
  }

  async createPorchClipSignedUrl(createPorchClipUrlDto: CreatePorchClipUrlDto) {
    const { fileName, contentLength } = createPorchClipUrlDto;
    const safeName = this.sanitizePorchFileName(fileName);
    const timestamp = Date.now();
    const key = `porch/${timestamp}-${safeName}.mp4`;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: 'video/mp4',
      ContentLength: contentLength,
      ServerSideEncryption: 'AES256',
      Metadata: {
        'x-amz-meta-timestamp': timestamp.toString(),
        'x-amz-meta-type': 'porch',
      },
    });

    try {
      const signedUrl = await getSignedUrl(
        this.s3Client,
        command,
        presignPutOptions(),
      );

      return {
        signedUrl,
        key,
        expiresAt: new Date(Date.now() + 900 * 1000).toISOString(),
        bucket: this.bucketName,
        metadata: {
          timestamp,
          type: 'porch',
        },
      };
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to generate porch clip signed URL',
      );
      throw new InternalServerErrorException(
        'Failed to generate porch clip signed URL',
      );
    }
  }

  async createFeederClipSignedUrl(
    createFeederClipUrlDto: CreateFeederClipUrlDto,
  ): Promise<{
    signedUrl: string;
    key: string;
    expiresAt: string;
    bucket: string;
    metadata: { timestamp: number; type: string };
  }> {
    const { fileName, contentType, contentLength } = createFeederClipUrlDto;
    if (
      !Number.isInteger(contentLength) ||
      contentLength < 1 ||
      contentLength > FEEDER_CLIP_MAX_BYTES
    ) {
      throw new BadRequestException('Feeder clip size is missing or too large');
    }
    if (contentType && contentType !== FEEDER_CLIP_CONTENT_TYPE) {
      throw new BadRequestException('Feeder clips must be video/mp4');
    }

    const safeName = this.sanitizeFeederFileName(fileName);
    const timestamp = Date.now();
    const key = `feeder/${timestamp}-${safeName}.mp4`;
    if (key.length > FEEDER_OBJECT_KEY_MAX_LENGTH || key.includes('..')) {
      throw new BadRequestException('Invalid feeder clip file name');
    }

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: FEEDER_CLIP_CONTENT_TYPE,
      ContentLength: contentLength,
      ServerSideEncryption: 'AES256',
      Metadata: {
        'x-amz-meta-timestamp': timestamp.toString(),
        'x-amz-meta-type': 'feeder',
      },
    });

    try {
      const signedUrl = await getSignedUrl(
        this.s3Client,
        command,
        presignPutOptions(),
      );

      return {
        signedUrl,
        key,
        expiresAt: new Date(Date.now() + 900 * 1000).toISOString(),
        bucket: this.bucketName,
        metadata: {
          timestamp,
          type: 'feeder',
        },
      };
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to generate feeder clip signed URL',
      );
      throw new InternalServerErrorException(
        'Failed to generate feeder clip signed URL',
      );
    }
  }

  private sanitizeFeederFileName(fileName: string): string {
    const baseName = fileName.split(/[/\\]/).pop() || 'clip';
    const withoutExtension = baseName.replace(/\.mp4$/i, '');
    return this.sanitizeObjectFileName(
      withoutExtension,
      'Invalid feeder clip file name',
    );
  }

  private sanitizePorchFileName(fileName: string): string {
    const baseName = fileName.split(/[/\\]/).pop() || 'clip';
    const withoutExtension = baseName.replace(/\.mp4$/i, '');
    return this.sanitizeObjectFileName(
      withoutExtension,
      'Invalid porch clip file name',
    );
  }

  private sanitizeObjectFileName(fileName: string, message: string): string {
    const baseName = fileName.split(/[/\\]/).pop() || '';
    const safeName = baseName.replace(/[^a-zA-Z0-9._-]/g, '');

    if (!safeName) {
      throw new BadRequestException(message);
    }

    return safeName;
  }

  private getContentType(format: string): string {
    switch (format.toLowerCase()) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'gif':
        return 'image/gif';
      case 'bmp':
        return 'image/bmp';
      case 'webp':
        return 'image/webp';
      default:
        return 'application/octet-stream';
    }
  }
}

function presignPutOptions(): {
  expiresIn: number;
  signableHeaders: Set<string>;
} {
  return {
    expiresIn: 900,
    signableHeaders: new Set(['content-type']),
  };
}
