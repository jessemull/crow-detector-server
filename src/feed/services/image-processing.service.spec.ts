import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ImageProcessingService } from './image-processing.service';
import * as AWS from 'aws-sdk';

jest.mock('aws-sdk');

jest.mock('sharp', () => {
  const mockSharp = {
    metadata: jest.fn(),
    extract: jest.fn(),
    resize: jest.fn(),
    jpeg: jest.fn(),
    toBuffer: jest.fn(),
  };

  mockSharp.extract.mockReturnValue(mockSharp);
  mockSharp.resize.mockReturnValue(mockSharp);
  mockSharp.jpeg.mockReturnValue(mockSharp);

  return jest.fn(() => mockSharp);
});

describe('ImageProcessingService', () => {
  let service: ImageProcessingService;
  let configService: ConfigService;
  let mockRekognition: jest.Mocked<AWS.Rekognition>;
  let mockS3: jest.Mocked<AWS.S3>;

  beforeEach(async () => {
    mockRekognition = {
      detectModerationLabels: jest.fn(),
      detectFaces: jest.fn(),
    } as any;

    mockS3 = {
      getObject: jest.fn(),
      putObject: jest.fn(),
    } as any;

    (AWS.Rekognition as unknown as jest.Mock).mockImplementation(
      () => mockRekognition,
    );
    (AWS.S3 as unknown as jest.Mock).mockImplementation(() => mockS3);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImageProcessingService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => {
              if (key === 'AWS_REGION') return 'us-west-2';
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<ImageProcessingService>(ImageProcessingService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize AWS services with correct configuration', () => {
      expect(AWS.Rekognition).toHaveBeenCalledWith({
        region: 'us-west-2',
      });
      expect(AWS.S3).toHaveBeenCalledWith({
        region: 'us-west-2',
      });
      expect(configService.get).toHaveBeenCalledWith('AWS_REGION', 'us-west-2');
    });
  });

  describe('processImage', () => {
    const bucket = 'test-bucket';
    const key = 'test-key.jpg';

    it('should process image successfully with appropriate content and face detected', async () => {
      mockRekognition.detectModerationLabels.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          ModerationLabels: [],
        }),
      } as any);

      mockRekognition.detectFaces.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          FaceDetails: [
            {
              BoundingBox: {
                Width: 0.3,
                Height: 0.4,
                Left: 0.2,
                Top: 0.1,
              },
            },
          ],
        }),
      } as any);

      mockS3.getObject.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          Body: Buffer.from('mock-image-data'),
        }),
      } as any);

      const sharp = jest.requireMock('sharp');
      const mockSharpInstance = sharp();
      mockSharpInstance.metadata.mockResolvedValue({
        width: 1000,
        height: 800,
      });
      mockSharpInstance.toBuffer.mockResolvedValue(
        Buffer.from('cropped-image'),
      );

      const result = await service.processImage(bucket, key);

      expect(result).toEqual({
        faceDetection: {
          faceDetected: true,
          boundingBox: {
            Width: 0.3,
            Height: 0.4,
            Left: 0.2,
            Top: 0.1,
          },
        },
        contentModeration: {
          isAppropriate: true,
          labels: [],
          confidence: 0,
        },
        croppedImageBuffer: Buffer.from('cropped-image'),
        processingDuration: expect.any(Number),
      });

      expect(mockRekognition.detectModerationLabels).toHaveBeenCalledWith({
        Image: {
          S3Object: {
            Bucket: bucket,
            Name: key,
          },
        },
        MinConfidence: 70,
      });

      expect(mockRekognition.detectFaces).toHaveBeenCalledWith({
        Image: {
          S3Object: {
            Bucket: bucket,
            Name: key,
          },
        },
        Attributes: ['DEFAULT'],
      });
    });

    it('should return early when content is inappropriate', async () => {
      mockRekognition.detectModerationLabels.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          ModerationLabels: [{ Name: 'Explicit Nudity', Confidence: 95.5 }],
        }),
      } as any);

      const result = await service.processImage(bucket, key);

      expect(result).toEqual({
        faceDetection: { faceDetected: false },
        contentModeration: {
          isAppropriate: false,
          labels: ['Explicit Nudity'],
          confidence: 95.5,
        },
        processingDuration: expect.any(Number),
      });

      expect(mockRekognition.detectFaces).not.toHaveBeenCalled();
    });

    it('should handle case when no face is detected', async () => {
      mockRekognition.detectModerationLabels.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          ModerationLabels: [],
        }),
      } as any);

      mockRekognition.detectFaces.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          FaceDetails: [],
        }),
      } as any);

      const result = await service.processImage(bucket, key);

      expect(result).toEqual({
        faceDetection: { faceDetected: false },
        contentModeration: {
          isAppropriate: true,
          labels: [],
          confidence: 0,
        },
        croppedImageBuffer: undefined,
        processingDuration: expect.any(Number),
      });
    });

    it('should handle processing errors', async () => {
      mockRekognition.detectModerationLabels.mockReturnValue({
        promise: jest.fn().mockRejectedValue(new Error('AWS error')),
      } as any);

      mockRekognition.detectFaces.mockReturnValue({
        promise: jest.fn().mockRejectedValue(new Error('Face detection error')),
      } as any);

      mockRekognition.detectModerationLabels.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          ModerationLabels: [],
        }),
      } as any);

      mockRekognition.detectFaces.mockReturnValue({
        promise: jest.fn().mockRejectedValue(new Error('Face detection error')),
      } as any);

      const result = await service.processImage(bucket, key);
      expect(result.faceDetection.faceDetected).toBe(false);
    });
  });

  describe('checkContentModeration', () => {
    const bucket = 'test-bucket';
    const key = 'test-key.jpg';

    it('should return appropriate when no moderation labels found', async () => {
      mockRekognition.detectModerationLabels.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          ModerationLabels: [],
        }),
      } as any);

      const result = await (service as any).checkContentModeration(bucket, key);

      expect(result).toEqual({
        isAppropriate: true,
        labels: [],
        confidence: 0,
      });
    });

    it('should return inappropriate when inappropriate labels found', async () => {
      mockRekognition.detectModerationLabels.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          ModerationLabels: [
            { Name: 'Violence', Confidence: 87.3 },
            { Name: 'Safe Content', Confidence: 12.7 },
          ],
        }),
      } as any);

      const result = await (service as any).checkContentModeration(bucket, key);

      expect(result).toEqual({
        isAppropriate: false,
        labels: ['Violence', 'Safe Content'],
        confidence: 87.3,
      });
    });

    it('should handle content moderation API errors', async () => {
      mockRekognition.detectModerationLabels.mockReturnValue({
        promise: jest.fn().mockRejectedValue(new Error('Rekognition error')),
      } as any);

      const result = await (service as any).checkContentModeration(bucket, key);

      expect(result).toEqual({
        isAppropriate: false,
        labels: ['ModerationCheckFailed'],
        confidence: 0,
      });
    });

    it('should handle content moderation API string errors', async () => {
      mockRekognition.detectModerationLabels.mockReturnValue({
        promise: jest.fn().mockRejectedValue('String Rekognition error'),
      } as any);

      const result = await (service as any).checkContentModeration(bucket, key);

      expect(result).toEqual({
        isAppropriate: false,
        labels: ['ModerationCheckFailed'],
        confidence: 0,
      });
    });

    it('should filter out undefined labels', async () => {
      mockRekognition.detectModerationLabels.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          ModerationLabels: [
            { Name: 'Violence', Confidence: 87.3 },
            { Name: undefined, Confidence: 50.0 },
          ],
        }),
      } as any);

      const result = await (service as any).checkContentModeration(bucket, key);

      expect(result.labels).toEqual(['Violence']);
    });
  });

  describe('detectFaces', () => {
    const bucket = 'test-bucket';
    const key = 'test-key.jpg';

    it('should return face detected with bounding box when face found', async () => {
      mockRekognition.detectFaces.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          FaceDetails: [
            {
              BoundingBox: {
                Width: 0.3,
                Height: 0.4,
                Left: 0.2,
                Top: 0.1,
              },
            },
          ],
        }),
      } as any);

      const result = await (service as any).detectFaces(bucket, key);

      expect(result).toEqual({
        faceDetected: true,
        boundingBox: {
          Width: 0.3,
          Height: 0.4,
          Left: 0.2,
          Top: 0.1,
        },
      });
    });

    it('should return no face detected when no faces found', async () => {
      mockRekognition.detectFaces.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          FaceDetails: [],
        }),
      } as any);

      const result = await (service as any).detectFaces(bucket, key);

      expect(result).toEqual({
        faceDetected: false,
      });
    });

    it('should return no face detected when bounding box is incomplete', async () => {
      mockRekognition.detectFaces.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          FaceDetails: [
            {
              BoundingBox: {
                Width: 0.3,
                Height: undefined,
                Left: 0.2,
                Top: 0.1,
              },
            },
          ],
        }),
      } as any);

      const result = await (service as any).detectFaces(bucket, key);

      expect(result).toEqual({
        faceDetected: false,
      });
    });

    it('should handle face detection API errors', async () => {
      mockRekognition.detectFaces.mockReturnValue({
        promise: jest.fn().mockRejectedValue(new Error('Face detection error')),
      } as any);

      const result = await (service as any).detectFaces(bucket, key);

      expect(result).toEqual({
        faceDetected: false,
      });
    });

    it('should handle face detection API string errors', async () => {
      mockRekognition.detectFaces.mockReturnValue({
        promise: jest.fn().mockRejectedValue('String face detection error'),
      } as any);

      const result = await (service as any).detectFaces(bucket, key);

      expect(result).toEqual({
        faceDetected: false,
      });
    });
  });

  describe('cropImageToFace', () => {
    const bucket = 'test-bucket';
    const key = 'test-key.jpg';
    const boundingBox = {
      Width: 0.3,
      Height: 0.4,
      Left: 0.2,
      Top: 0.1,
    };

    it('should crop image successfully', async () => {
      mockS3.getObject.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          Body: Buffer.from('mock-image-data'),
        }),
      } as any);

      const sharp = jest.requireMock('sharp');
      const mockSharpInstance = sharp();
      mockSharpInstance.metadata.mockResolvedValue({
        width: 1000,
        height: 800,
      });
      mockSharpInstance.toBuffer.mockResolvedValue(
        Buffer.from('cropped-image'),
      );

      const result = await (service as any).cropImageToFace(
        bucket,
        key,
        boundingBox,
      );

      expect(result).toEqual(Buffer.from('cropped-image'));
      expect(mockS3.getObject).toHaveBeenCalledWith({
        Bucket: bucket,
        Key: key,
      });
      expect(sharp).toHaveBeenCalledWith(Buffer.from('mock-image-data'));
      expect(mockSharpInstance.metadata).toHaveBeenCalled();
      expect(mockSharpInstance.extract).toHaveBeenCalledWith({
        left: 140,
        top: 16,
        width: 420,
        height: 448,
      });
      expect(mockSharpInstance.resize).toHaveBeenCalledWith(800, 800, {
        fit: 'inside',
        withoutEnlargement: true,
      });
      expect(mockSharpInstance.jpeg).toHaveBeenCalledWith({ quality: 85 });
    });

    it('should handle missing image dimensions', async () => {
      mockS3.getObject.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          Body: Buffer.from('mock-image-data'),
        }),
      } as any);

      const sharp = jest.requireMock('sharp');
      const mockSharpInstance = sharp();
      mockSharpInstance.metadata.mockResolvedValue({
        width: undefined,
        height: 800,
      });

      await expect(
        (service as any).cropImageToFace(bucket, key, boundingBox),
      ).rejects.toThrow('Could not determine image dimensions');
    });

    it('should handle S3 getObject errors', async () => {
      mockS3.getObject.mockReturnValue({
        promise: jest.fn().mockRejectedValue(new Error('S3 error')),
      } as any);

      await expect(
        (service as any).cropImageToFace(bucket, key, boundingBox),
      ).rejects.toThrow('S3 error');
    });

    it('should handle S3 getObject string errors', async () => {
      mockS3.getObject.mockReturnValue({
        promise: jest.fn().mockRejectedValue('String S3 error'),
      } as any);

      await expect(
        (service as any).cropImageToFace(bucket, key, boundingBox),
      ).rejects.toBe('String S3 error');
    });

    it('should handle sharp processing errors', async () => {
      mockS3.getObject.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          Body: Buffer.from('mock-image-data'),
        }),
      } as any);

      const sharp = jest.requireMock('sharp');
      const mockSharpInstance = sharp();
      mockSharpInstance.metadata.mockRejectedValue(new Error('Sharp error'));

      await expect(
        (service as any).cropImageToFace(bucket, key, boundingBox),
      ).rejects.toThrow('Sharp error');
    });

    it('should handle sharp processing string errors', async () => {
      mockS3.getObject.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          Body: Buffer.from('mock-image-data'),
        }),
      } as any);

      const sharp = jest.requireMock('sharp');
      const mockSharpInstance = sharp();
      mockSharpInstance.metadata.mockRejectedValue('String sharp error');

      await expect(
        (service as any).cropImageToFace(bucket, key, boundingBox),
      ).rejects.toBe('String sharp error');
    });
  });

  describe('uploadProcessedImage', () => {
    const bucket = 'test-bucket';
    const key = 'test-key.jpg';
    const imageBuffer = Buffer.from('processed-image');

    it('should upload processed image successfully', async () => {
      mockS3.putObject.mockReturnValue({
        promise: jest.fn().mockResolvedValue({}),
      } as any);

      const result = await service.uploadProcessedImage(
        bucket,
        key,
        imageBuffer,
      );

      expect(result).toBe(
        'https://test-bucket.s3.us-west-2.amazonaws.com/test-key_cropped.jpg',
      );
      expect(mockS3.putObject).toHaveBeenCalledWith({
        Bucket: bucket,
        Key: 'test-key_cropped.jpg',
        Body: imageBuffer,
        ContentType: 'image/jpeg',
        ServerSideEncryption: 'AES256',
      });
    });

    it('should handle S3 upload errors', async () => {
      mockS3.putObject.mockReturnValue({
        promise: jest.fn().mockRejectedValue(new Error('Upload failed')),
      } as any);

      await expect(
        service.uploadProcessedImage(bucket, key, imageBuffer),
      ).rejects.toThrow('Upload failed');
    });

    it('should handle S3 upload string errors', async () => {
      mockS3.putObject.mockReturnValue({
        promise: jest.fn().mockRejectedValue('String upload failed'),
      } as any);

      await expect(
        service.uploadProcessedImage(bucket, key, imageBuffer),
      ).rejects.toBe('String upload failed');
    });
  });
});
