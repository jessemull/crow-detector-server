import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ImageProcessingService } from './image-processing.service';
import {
  RekognitionClient,
  DetectModerationLabelsCommand,
  DetectFacesCommand,
} from '@aws-sdk/client-rekognition';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

jest.mock('@aws-sdk/client-rekognition');
jest.mock('@aws-sdk/client-s3');

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
  let mockRekognitionSend: jest.Mock;
  let mockS3Send: jest.Mock;

  beforeEach(async () => {
    mockRekognitionSend = jest.fn();
    mockS3Send = jest.fn();

    (RekognitionClient as jest.Mock).mockImplementation(() => ({
      send: mockRekognitionSend,
    }));

    (S3Client as jest.Mock).mockImplementation(() => ({
      send: mockS3Send,
    }));

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
      expect(RekognitionClient).toHaveBeenCalledWith({
        region: 'us-west-2',
      });
      expect(S3Client).toHaveBeenCalledWith({
        region: 'us-west-2',
      });
      expect(configService.get).toHaveBeenCalledWith('AWS_REGION');
    });
  });

  describe('processImage', () => {
    const bucket = 'test-bucket';
    const key = 'test-key.jpg';

    it('should process image successfully with appropriate content and face detected', async () => {
      mockRekognitionSend.mockResolvedValueOnce({
        ModerationLabels: [],
      });

      mockRekognitionSend.mockResolvedValueOnce({
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
      });

      const mockBody = {
        transformToByteArray: jest
          .fn()
          .mockResolvedValue(new Uint8Array(Buffer.from('mock-image-data'))),
      };
      mockS3Send.mockResolvedValueOnce({
        Body: mockBody,
      });

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

      expect(mockRekognitionSend).toHaveBeenCalledWith(
        expect.any(DetectModerationLabelsCommand),
      );
      expect(mockRekognitionSend).toHaveBeenCalledWith(
        expect.any(DetectFacesCommand),
      );
    });

    it('should return early when content is inappropriate', async () => {
      mockRekognitionSend.mockResolvedValueOnce({
        ModerationLabels: [{ Name: 'Explicit Nudity', Confidence: 95.5 }],
      });

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

      expect(mockRekognitionSend).toHaveBeenCalledTimes(1);
    });

    it('should handle case when no face is detected', async () => {
      mockRekognitionSend.mockResolvedValueOnce({
        ModerationLabels: [],
      });

      mockRekognitionSend.mockResolvedValueOnce({
        FaceDetails: [],
      });

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
      mockRekognitionSend.mockRejectedValueOnce(new Error('AWS error'));

      mockRekognitionSend.mockResolvedValueOnce({
        ModerationLabels: [],
      });

      mockRekognitionSend.mockRejectedValueOnce(
        new Error('Face detection error'),
      );

      const result = await service.processImage(bucket, key);
      expect(result.faceDetection.faceDetected).toBe(false);
    });

    it('should throw error from main catch block when checkContentModeration throws unhandled error', async () => {
      const error = new Error('Unhandled moderation error');

      const checkContentModerationSpy = jest.spyOn(
        service as any,
        'checkContentModeration',
      );
      checkContentModerationSpy.mockRejectedValue(error);

      await expect(service.processImage(bucket, key)).rejects.toBe(error);

      checkContentModerationSpy.mockRestore();
    });

    it('should throw string error from main catch block when checkContentModeration throws unhandled string error', async () => {
      const error = 'Unhandled string moderation error';

      const checkContentModerationSpy = jest.spyOn(
        service as any,
        'checkContentModeration',
      );
      checkContentModerationSpy.mockRejectedValue(error);

      await expect(service.processImage(bucket, key)).rejects.toBe(error);

      checkContentModerationSpy.mockRestore();
    });
  });

  describe('checkContentModeration', () => {
    const bucket = 'test-bucket';
    const key = 'test-key.jpg';

    it('should return appropriate when no moderation labels found', async () => {
      mockRekognitionSend.mockResolvedValue({
        ModerationLabels: [],
      });

      const result = await (service as any).checkContentModeration(bucket, key);

      expect(result).toEqual({
        isAppropriate: true,
        labels: [],
        confidence: 0,
      });
    });

    it('should return inappropriate when inappropriate labels found', async () => {
      mockRekognitionSend.mockResolvedValue({
        ModerationLabels: [
          { Name: 'Violence', Confidence: 87.3 },
          { Name: 'Safe Content', Confidence: 12.7 },
        ],
      });

      const result = await (service as any).checkContentModeration(bucket, key);

      expect(result).toEqual({
        isAppropriate: false,
        labels: ['Violence', 'Safe Content'],
        confidence: 87.3,
      });
    });

    it('should handle content moderation API errors', async () => {
      mockRekognitionSend.mockRejectedValue(new Error('Rekognition error'));

      const result = await (service as any).checkContentModeration(bucket, key);

      expect(result).toEqual({
        isAppropriate: false,
        labels: ['ModerationCheckFailed'],
        confidence: 0,
      });
    });

    it('should handle content moderation API string errors', async () => {
      mockRekognitionSend.mockRejectedValue('String Rekognition error');

      const result = await (service as any).checkContentModeration(bucket, key);

      expect(result).toEqual({
        isAppropriate: false,
        labels: ['ModerationCheckFailed'],
        confidence: 0,
      });
    });

    it('should filter out undefined labels', async () => {
      mockRekognitionSend.mockResolvedValue({
        ModerationLabels: [
          { Name: 'Violence', Confidence: 87.3 },
          { Name: undefined, Confidence: 50.0 },
        ],
      });

      const result = await (service as any).checkContentModeration(bucket, key);

      expect(result.labels).toEqual(['Violence']);
    });
  });

  describe('detectFaces', () => {
    const bucket = 'test-bucket';
    const key = 'test-key.jpg';

    it('should return face detected with bounding box when face found', async () => {
      mockRekognitionSend.mockResolvedValue({
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
      });

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
      mockRekognitionSend.mockResolvedValue({
        FaceDetails: [],
      });

      const result = await (service as any).detectFaces(bucket, key);

      expect(result).toEqual({
        faceDetected: false,
      });
    });

    it('should return no face detected when bounding box is incomplete', async () => {
      mockRekognitionSend.mockResolvedValue({
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
      });

      const result = await (service as any).detectFaces(bucket, key);

      expect(result).toEqual({
        faceDetected: false,
      });
    });

    it('should handle face detection API errors', async () => {
      mockRekognitionSend.mockRejectedValue(new Error('Face detection error'));

      const result = await (service as any).detectFaces(bucket, key);

      expect(result).toEqual({
        faceDetected: false,
      });
    });

    it('should handle face detection API string errors', async () => {
      mockRekognitionSend.mockRejectedValue('String face detection error');

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
      const mockBody = {
        transformToByteArray: jest
          .fn()
          .mockResolvedValue(new Uint8Array(Buffer.from('mock-image-data'))),
      };
      mockS3Send.mockResolvedValue({
        Body: mockBody,
      });

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
      expect(mockS3Send).toHaveBeenCalledWith(expect.any(GetObjectCommand));
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
      const mockBody = {
        transformToByteArray: jest
          .fn()
          .mockResolvedValue(new Uint8Array(Buffer.from('mock-image-data'))),
      };
      mockS3Send.mockResolvedValue({
        Body: mockBody,
      });

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
      mockS3Send.mockRejectedValue(new Error('S3 error'));

      await expect(
        (service as any).cropImageToFace(bucket, key, boundingBox),
      ).rejects.toThrow('S3 error');
    });

    it('should handle S3 getObject string errors', async () => {
      mockS3Send.mockRejectedValue('String S3 error');

      await expect(
        (service as any).cropImageToFace(bucket, key, boundingBox),
      ).rejects.toBe('String S3 error');
    });

    it('should handle sharp processing errors', async () => {
      const mockBody = {
        transformToByteArray: jest
          .fn()
          .mockResolvedValue(new Uint8Array(Buffer.from('mock-image-data'))),
      };
      mockS3Send.mockResolvedValue({
        Body: mockBody,
      });

      const sharp = jest.requireMock('sharp');
      const mockSharpInstance = sharp();
      mockSharpInstance.metadata.mockRejectedValue(new Error('Sharp error'));

      await expect(
        (service as any).cropImageToFace(bucket, key, boundingBox),
      ).rejects.toThrow('Sharp error');
    });

    it('should handle sharp processing string errors', async () => {
      const mockBody = {
        transformToByteArray: jest
          .fn()
          .mockResolvedValue(new Uint8Array(Buffer.from('mock-image-data'))),
      };
      mockS3Send.mockResolvedValue({
        Body: mockBody,
      });

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
      mockS3Send.mockResolvedValue({});

      const result = await service.uploadProcessedImage(
        bucket,
        key,
        imageBuffer,
      );

      expect(result).toBe(
        'https://test-bucket.s3.us-west-2.amazonaws.com/processed/test-key_cropped.jpg',
      );
      expect(mockS3Send).toHaveBeenCalledWith(expect.any(PutObjectCommand));
    });

    it('should handle S3 upload errors', async () => {
      mockS3Send.mockRejectedValue(new Error('Upload failed'));

      await expect(
        service.uploadProcessedImage(bucket, key, imageBuffer),
      ).rejects.toThrow('Upload failed');
    });

    it('should handle S3 upload string errors', async () => {
      mockS3Send.mockRejectedValue('String upload failed');

      await expect(
        service.uploadProcessedImage(bucket, key, imageBuffer),
      ).rejects.toBe('String upload failed');
    });
  });
});
