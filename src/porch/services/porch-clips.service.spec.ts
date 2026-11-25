import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PorchClipsService } from './porch-clips.service';

jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/s3-request-presigner');

const mockS3Client = S3Client as jest.MockedClass<typeof S3Client>;
const mockGetSignedUrl = getSignedUrl as jest.MockedFunction<
  typeof getSignedUrl
>;

describe('PorchClipsService', () => {
  let service: PorchClipsService;
  let sendMock: jest.Mock;

  beforeEach(async () => {
    sendMock = jest.fn();
    mockS3Client.mockImplementation(
      () =>
        ({
          send: sendMock,
        }) as any,
    );
    mockGetSignedUrl.mockResolvedValue(
      'https://test-bucket.s3.amazonaws.com/porch/clip.mp4?X-Amz-Signature=abc',
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PorchClipsService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 's3BucketName') {
                return 'test-bucket';
              }
              if (key === 'awsRegion') {
                return 'us-west-2';
              }
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get(PorchClipsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('lists mp4 clips with short-lived playback urls', async () => {
    sendMock.mockResolvedValue({
      Contents: [
        {
          Key: 'porch/older.mp4',
          LastModified: new Date('2026-11-01T00:00:00.000Z'),
        },
        {
          Key: 'porch/newer.mp4',
          LastModified: new Date('2026-11-14T00:00:00.000Z'),
        },
        {
          Key: 'porch/readme.txt',
          LastModified: new Date('2026-11-14T00:00:00.000Z'),
        },
      ],
      IsTruncated: false,
    });

    const clips = await service.listClips();

    expect(clips).toHaveLength(2);
    expect(clips[0].name).toBe('newer.mp4');
    expect(clips[0].playbackUrl).toContain('X-Amz-Signature');
    expect(clips[0].recordedAt).toBe('2026-11-14T00:00:00.000Z');
    expect(JSON.stringify(clips)).not.toContain('"key"');
  });

  it('keeps only the newest window of clips while listing', async () => {
    const contents = Array.from({ length: 55 }, (_, index) => ({
      Key: `porch/${String(index).padStart(3, '0')}.mp4`,
      LastModified: new Date(Date.UTC(2026, 10, 1, 0, 0, index)),
    }));
    sendMock.mockResolvedValue({
      Contents: contents,
      IsTruncated: false,
    });

    const clips = await service.listClips();

    expect(clips).toHaveLength(50);
    expect(clips[0].name).toBe('054.mp4');
    expect(clips[49].name).toBe('005.mp4');
  });

  it('throws when listing fails', async () => {
    sendMock.mockRejectedValue(new Error('S3 down'));
    await expect(service.listClips()).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('requires a bucket name', () => {
    expect(
      () =>
        new PorchClipsService({
          get: () => undefined,
        } as any),
    ).toThrow(/S3_BUCKET_NAME/);
  });
});
