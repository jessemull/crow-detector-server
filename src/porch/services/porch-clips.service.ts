import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
  _Object,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { logger } from 'src/common/logger/logger.config';

export type PorchClipListItem = {
  name: string;
  recordedAt: string;
  playbackUrl: string;
  expiresAt: string;
};

const PLAYBACK_EXPIRES_SECONDS = 300;
const MAX_CLIPS = 50;
const PORCH_PREFIX = 'porch/';

@Injectable()
export class PorchClipsService {
  private readonly s3Client: S3Client;
  private readonly bucketName: string;

  constructor(private readonly configService: ConfigService) {
    this.s3Client = new S3Client({
      region: this.configService.get<string>('awsRegion') || 'us-west-2',
    });

    const bucketName = this.configService.get<string>('s3BucketName');
    if (!bucketName) {
      throw new Error('s3BucketName (S3_BUCKET_NAME) is required');
    }
    this.bucketName = bucketName;
  }

  async listClips(): Promise<PorchClipListItem[]> {
    try {
      // Keys are porch/{timestamp}-… so ascending list order is oldest→newest.
      // Keep only the trailing window instead of buffering the whole prefix.
      const newest = await this.listNewestPorchObjects();
      return Promise.all(
        [...newest].reverse().map((object) => this.toListItem(object)),
      );
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to list porch clips',
      );
      throw new BadRequestException('Failed to list porch clips');
    }
  }

  private async listNewestPorchObjects(): Promise<_Object[]> {
    const newest: _Object[] = [];
    let continuationToken: string | undefined;

    do {
      const response = await this.s3Client.send(
        new ListObjectsV2Command({
          Bucket: this.bucketName,
          Prefix: PORCH_PREFIX,
          ContinuationToken: continuationToken,
          MaxKeys: 1000,
        }),
      );

      for (const object of response.Contents || []) {
        if (!this.isMp4(object.Key)) {
          continue;
        }
        newest.push(object);
        if (newest.length > MAX_CLIPS) {
          newest.shift();
        }
      }

      continuationToken = response.IsTruncated
        ? response.NextContinuationToken
        : undefined;
    } while (continuationToken);

    return newest;
  }

  private async toListItem(object: _Object): Promise<PorchClipListItem> {
    const key = object.Key as string;
    const expiresAt = new Date(
      Date.now() + PLAYBACK_EXPIRES_SECONDS * 1000,
    ).toISOString();
    const playbackUrl = await getSignedUrl(
      this.s3Client,
      new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      }),
      { expiresIn: PLAYBACK_EXPIRES_SECONDS },
    );

    return {
      name: key.slice(PORCH_PREFIX.length),
      recordedAt: (object.LastModified || new Date()).toISOString(),
      playbackUrl,
      expiresAt,
    };
  }

  private isMp4(key: string | undefined): key is string {
    return typeof key === 'string' && key.toLowerCase().endsWith('.mp4');
  }
}
