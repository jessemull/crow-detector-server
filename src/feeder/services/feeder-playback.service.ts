import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3ClientOptions } from 'src/common/aws/client-options';
import { assertFeederMp4Key } from './dispense-request.service';

const PLAYBACK_EXPIRES_SECONDS = 300;

@Injectable()
export class FeederPlaybackService {
  private readonly s3Client: S3Client;
  private readonly bucketName: string;

  constructor(private readonly configService: ConfigService) {
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

  async signPlayback(
    key: string,
  ): Promise<{ playbackUrl: string; expiresAt: string }> {
    assertFeederMp4Key(key, 'Invalid feeder video key');
    const expiresAt = new Date(
      Date.now() + PLAYBACK_EXPIRES_SECONDS * 1000,
    ).toISOString();
    const playbackUrl = await getSignedUrl(
      this.s3Client,
      new GetObjectCommand({ Bucket: this.bucketName, Key: key }),
      { expiresIn: PLAYBACK_EXPIRES_SECONDS },
    );
    return { playbackUrl, expiresAt };
  }
}
