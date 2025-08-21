import { ConfigService } from '@nestjs/config';
import { CreateFeedImageUrlDto, CreateDetectionImageUrlDto } from '../dto';
import { Injectable, BadRequestException } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class UrlsService {
  private readonly s3Client: S3Client;
  private readonly bucketName: string;

  constructor(private readonly configService: ConfigService) {
    this.s3Client = new S3Client({
      region: this.configService.get<string>('AWS_REGION') || 'us-west-2',
    });

    const bucketName = this.configService.get<string>('S3_BUCKET_NAME');

    if (!bucketName) {
      throw new Error('S3_BUCKET_NAME environment variable is required');
    }

    this.bucketName = bucketName;
  }

  async createFeedImageSignedUrl(createFeedImageUrlDto: CreateFeedImageUrlDto) {
    const { fileName, format, source, contentType } = createFeedImageUrlDto;

    const timestamp = Date.now();
    const uniqueFileName = `${timestamp}-${fileName}`;
    const key = `feed/${uniqueFileName}.${format}`;

    const finalContentType = contentType || this.getContentType(format);

    // Create the S3 command with metadata...

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: finalContentType,
      ServerSideEncryption: 'AES256',
      Metadata: {
        'x-amz-meta-timestamp': timestamp.toString(),
        'x-amz-meta-source': source,
        'x-amz-meta-type': 'feed',
      },
    });

    try {
      const signedUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn: 900, // 15 minutes
      });

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
      console.error('Failed to generate feed image signed URL:', error);
      throw new BadRequestException('Failed to generate feed image signed URL');
    }
  }

  async createDetectionImageSignedUrl(
    createDetectionImageUrlDto: CreateDetectionImageUrlDto,
  ) {
    const { fileName, format, feedEventId, contentType } =
      createDetectionImageUrlDto;

    const timestamp = Date.now();
    const uniqueFileName = `${timestamp}-${fileName}`;
    const key = `detection/${feedEventId}/${uniqueFileName}.${format}`;

    const finalContentType = contentType || this.getContentType(format);

    // Create the S3 command with metadata...

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: finalContentType,
      ServerSideEncryption: 'AES256',
      Metadata: {
        'x-amz-meta-timestamp': timestamp.toString(),
        'x-amz-meta-feed-event-id': feedEventId,
        'x-amz-meta-type': 'detection',
      },
    });

    try {
      const signedUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn: 900, // 15 minutes
      });

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
      console.error('Failed to generate detection image signed URL:', error);
      throw new BadRequestException(
        'Failed to generate detection image signed URL',
      );
    }
  }

  private getContentType(format: string): string {
    switch (format.toLowerCase()) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      default:
        return 'application/octet-stream';
    }
  }
}
