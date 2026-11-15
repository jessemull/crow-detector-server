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
      const objects = await this.listPorchObjects();
      const clips = objects
        .filter((object) => this.isMp4(object.Key))
        .sort((left, right) => {
          const leftTime = left.LastModified?.getTime() || 0;
          const rightTime = right.LastModified?.getTime() || 0;
          return rightTime - leftTime;
        })
        .slice(0, MAX_CLIPS);

      return Promise.all(clips.map((object) => this.toListItem(object)));
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to list porch clips',
      );
      throw new BadRequestException('Failed to list porch clips');
    }
  }

  private async listPorchObjects(): Promise<_Object[]> {
    const objects: _Object[] = [];
    let continuationToken: string | undefined;

    do {
      const response = await this.s3Client.send(
        new ListObjectsV2Command({
          Bucket: this.bucketName,
          Prefix: PORCH_PREFIX,
          ContinuationToken: continuationToken,
        }),
      );
      objects.push(...(response.Contents || []));
      continuationToken = response.IsTruncated
        ? response.NextContinuationToken
        : undefined;
    } while (continuationToken);

    return objects;
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
