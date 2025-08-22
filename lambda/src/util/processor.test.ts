import { SQSRecord } from 'aws-lambda';
import { callAPI } from './api';
import { extractS3Info } from './s3';
import { isImageFile, isRelevantEvent } from './images';
import { processSQSRecord } from './processor';

jest.mock('./api');
jest.mock('./s3');
jest.mock('./images');

const mockedCallAPI = callAPI as jest.MockedFunction<typeof callAPI>;
const mockedExtractS3Info = extractS3Info as jest.MockedFunction<
  typeof extractS3Info
>;
const mockedIsImageFile = isImageFile as jest.MockedFunction<
  typeof isImageFile
>;
const mockedIsRelevantEvent = isRelevantEvent as jest.MockedFunction<
  typeof isRelevantEvent
>;

describe('Processor Utility', () => {
  let mockRecord: SQSRecord;
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    mockRecord = {
      messageId: 'test-message-id',
      receiptHandle: 'test-receipt-handle',
      body: 'test-body',
      attributes: {},
      messageAttributes: {},
      md5OfBody: 'test-md5',
      eventSource: 'aws:sqs',
      eventSourceARN: 'arn:aws:sqs:us-east-1:123456789012:test-queue',
      awsRegion: 'us-east-1',
    } as SQSRecord;

    mockedExtractS3Info.mockReturnValue({
      bucket: 'test-bucket',
      key: 'feed/test-image.jpg',
      size: 1024,
      eventName: 'ObjectCreated:Put',
    });
    mockedIsImageFile.mockReturnValue(true);
    mockedIsRelevantEvent.mockReturnValue(true);
    mockedCallAPI.mockResolvedValue();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('processSQSRecord', () => {
    it('should successfully process an image file', async () => {
      const result = await processSQSRecord(mockRecord);

      expect(result).toEqual({
        success: true,
        message: 'Successfully processed: feed/test-image.jpg',
        timestamp: expect.any(String),
      });

      expect(mockedExtractS3Info).toHaveBeenCalledWith(mockRecord);
      expect(mockedIsImageFile).toHaveBeenCalledWith('feed/test-image.jpg');
      expect(mockedIsRelevantEvent).toHaveBeenCalledWith('ObjectCreated:Put');
      expect(mockedCallAPI).toHaveBeenCalledWith({
        bucket: 'test-bucket',
        key: 'feed/test-image.jpg',
        size: 1024,
        eventName: 'ObjectCreated:Put',
      });
    });

    it('should log processing info in non-test environment', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      await processSQSRecord(mockRecord);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Processing S3 object:',
        JSON.stringify(
          {
            bucket: 'test-bucket',
            key: 'feed/test-image.jpg',
            size: 1024,
            eventName: 'ObjectCreated:Put',
          },
          null,
          2,
        ),
      );

      process.env.NODE_ENV = originalEnv;
    });

    it('should not log processing info in test environment', async () => {
      // Ensure NODE_ENV is test
      process.env.NODE_ENV = 'test';

      await processSQSRecord(mockRecord);

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should skip non-image files', async () => {
      mockedIsImageFile.mockReturnValue(false);

      const result = await processSQSRecord(mockRecord);

      expect(result).toEqual({
        success: true,
        message: 'Skipped non-image file: feed/test-image.jpg',
        timestamp: expect.any(String),
      });

      expect(mockedCallAPI).not.toHaveBeenCalled();
    });

    it('should skip non-relevant events', async () => {
      mockedIsRelevantEvent.mockReturnValue(false);

      const result = await processSQSRecord(mockRecord);

      expect(result).toEqual({
        success: true,
        message: 'Skipped non-upload event: ObjectCreated:Put',
        timestamp: expect.any(String),
      });

      expect(mockedCallAPI).not.toHaveBeenCalled();
    });

    it('should handle errors during processing', async () => {
      const testError = new Error('Test error message');
      mockedExtractS3Info.mockImplementation(() => {
        throw testError;
      });

      const result = await processSQSRecord(mockRecord);

      expect(result).toEqual({
        success: false,
        message: 'Failed to process: Test error message',
        timestamp: expect.any(String),
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error processing S3 record:',
        'Test error message',
      );
    });

    it('should handle non-Error objects during processing', async () => {
      const testError = 'String error message';
      mockedExtractS3Info.mockImplementation(() => {
        throw testError;
      });

      const result = await processSQSRecord(mockRecord);

      expect(result).toEqual({
        success: false,
        message: 'Failed to process: Unknown error',
        timestamp: expect.any(String),
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error processing S3 record:',
        'String error message',
      );
    });

    it('should handle errors from callAPI', async () => {
      const testError = new Error('API call failed');
      mockedCallAPI.mockRejectedValue(testError);

      const result = await processSQSRecord(mockRecord);

      expect(result).toEqual({
        success: false,
        message: 'Failed to process: API call failed',
        timestamp: expect.any(String),
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error processing S3 record:',
        'API call failed',
      );
    });

    it('should handle errors from isImageFile', async () => {
      const testError = new Error('Image validation failed');
      mockedIsImageFile.mockImplementation(() => {
        throw testError;
      });

      const result = await processSQSRecord(mockRecord);

      expect(result).toEqual({
        success: false,
        message: 'Failed to process: Image validation failed',
        timestamp: expect.any(String),
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error processing S3 record:',
        'Image validation failed',
      );
    });

    it('should handle errors from isRelevantEvent', async () => {
      const testError = new Error('Event validation failed');
      mockedIsRelevantEvent.mockImplementation(() => {
        throw testError;
      });

      const result = await processSQSRecord(mockRecord);

      expect(result).toEqual({
        success: false,
        message: 'Failed to process: Event validation failed',
        timestamp: expect.any(String),
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error processing S3 record:',
        'Event validation failed',
      );
    });
  });
});
