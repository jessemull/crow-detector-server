import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { FeederPlaybackService } from './feeder-playback.service';

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({})),
  GetObjectCommand: jest.fn().mockImplementation((input) => input),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

const mockGetSignedUrl = getSignedUrl as jest.MockedFunction<
  typeof getSignedUrl
>;

describe('FeederPlaybackService', () => {
  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'awsRegion') return 'us-west-2';
      if (key === 's3BucketName') return 'test-bucket';
      return undefined;
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSignedUrl.mockResolvedValue(
      'https://cdn.example.com/clip.mp4?sig=1',
    );
  });

  it('requires a bucket name', () => {
    expect(
      () =>
        new FeederPlaybackService({
          get: () => undefined,
        } as unknown as ConfigService),
    ).toThrow('s3BucketName');
  });

  it('signs a feeder mp4 for a few minutes', async () => {
    const service = new FeederPlaybackService(
      configService as unknown as ConfigService,
    );

    const result = await service.signPlayback('feeder/visit.mp4');

    expect(result.playbackUrl).toBe('https://cdn.example.com/clip.mp4?sig=1');
    expect(Date.parse(result.expiresAt)).toBeGreaterThan(Date.now());
    expect(mockGetSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      { Bucket: 'test-bucket', Key: 'feeder/visit.mp4' },
      { expiresIn: 300 },
    );
  });

  it('rejects keys outside the feeder prefix', async () => {
    const service = new FeederPlaybackService(
      configService as unknown as ConfigService,
    );

    await expect(
      service.signPlayback('porch/visit.mp4'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });

  it('rejects feeder keys that contain path traversal', async () => {
    const service = new FeederPlaybackService(
      configService as unknown as ConfigService,
    );

    await expect(
      service.signPlayback('feeder/../porch/visit.mp4'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });
});
