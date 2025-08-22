import { SQSRecord } from 'aws-lambda';
import { extractS3Info } from './s3';

describe('S3 Utility', () => {
  describe('extractS3Info', () => {
    let mockConsoleError: jest.SpyInstance;

    beforeEach(() => {
      mockConsoleError = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
    });

    afterEach(() => {
      mockConsoleError.mockRestore();
    });

    it('should successfully extract S3 info from valid record', () => {
      const mockRecord = createMockSQSRecord(
        'test-bucket',
        'test-key.jpg',
        'ObjectCreated:Put',
        1024,
      );

      const result = extractS3Info(mockRecord);

      expect(result).toEqual({
        bucket: 'test-bucket',
        key: 'test-key.jpg',
        size: 1024,
        eventName: 'ObjectCreated:Put',
      });
    });

    it('should handle URL encoding in key names', () => {
      const mockRecord = createMockSQSRecord(
        'test-bucket',
        'test%20key%2Bwith%20spaces.jpg',
        'ObjectCreated:Put',
        1024,
      );

      const result = extractS3Info(mockRecord);

      expect(result.key).toBe('test key+with spaces.jpg');
    });

    it('should handle missing size and default to 0', () => {
      const mockRecord = createMockSQSRecord(
        'test-bucket',
        'test-key.jpg',
        'ObjectCreated:Put',
      );

      const result = extractS3Info(mockRecord);

      expect(result.size).toBe(0);
    });

    it('should throw error when Records array is missing', () => {
      const mockRecord = createMockSQSRecord(
        'test-bucket',
        'test-key.jpg',
        'ObjectCreated:Put',
      );
      // Remove Records array
      const s3Event = JSON.parse(mockRecord.body);
      delete s3Event.Records;
      mockRecord.body = JSON.stringify(s3Event);

      expect(() => extractS3Info(mockRecord)).toThrow(
        'No Records array in S3 event',
      );
    });

    it('should throw error when Records array is empty', () => {
      const mockRecord = createMockSQSRecord(
        'test-bucket',
        'test-key.jpg',
        'ObjectCreated:Put',
      );
      // Make Records array empty
      const s3Event = JSON.parse(mockRecord.body);
      s3Event.Records = [];
      mockRecord.body = JSON.stringify(s3Event);

      expect(() => extractS3Info(mockRecord)).toThrow(
        'No Records array in S3 event',
      );
    });

    it('should throw error when s3 object is missing', () => {
      const mockRecord = createMockSQSRecord(
        'test-bucket',
        'test-key.jpg',
        'ObjectCreated:Put',
      );
      // Remove s3 object
      const s3Event = JSON.parse(mockRecord.body);
      delete s3Event.Records[0].s3;
      mockRecord.body = JSON.stringify(s3Event);

      expect(() => extractS3Info(mockRecord)).toThrow(
        'No s3 object in S3 record',
      );
    });

    it('should handle JSON parsing errors', () => {
      const mockRecord = createMockSQSRecord(
        'test-bucket',
        'test-key.jpg',
        'ObjectCreated:Put',
      );
      // Make body invalid JSON
      mockRecord.body = 'invalid json';

      expect(() => extractS3Info(mockRecord)).toThrow();
      expect(mockConsoleError).toHaveBeenCalledWith(
        'Error in extractS3Info:',
        expect.any(Error),
      );
    });

    it('should re-throw errors after logging them', () => {
      const mockRecord = createMockSQSRecord(
        'test-bucket',
        'test-key.jpg',
        'ObjectCreated:Put',
      );
      // Make body invalid JSON to trigger error
      mockRecord.body = 'invalid json';

      expect(() => extractS3Info(mockRecord)).toThrow();
      expect(mockConsoleError).toHaveBeenCalled();
    });
  });
});

function createMockSQSRecord(
  bucket: string,
  key: string,
  eventName: string,
  size?: number,
): SQSRecord {
  const s3Event = {
    Records: [
      {
        eventVersion: '2.1',
        eventSource: 'aws:s3',
        awsRegion: 'us-east-1',
        eventTime: new Date().toISOString(),
        eventName,
        userIdentity: {
          principalId: 'test-user',
        },
        requestParameters: {
          sourceIPAddress: '127.0.0.1',
        },
        responseElements: {
          'x-amz-request-id': 'test-request-id',
          'x-amz-id-2': 'test-id-2',
        },
        s3: {
          s3SchemaVersion: '1.0',
          configurationId: 'test-config',
          bucket: {
            name: bucket,
            ownerIdentity: {
              principalId: 'test-owner',
            },
            arn: `arn:aws:s3:::${bucket}`,
          },
          object: {
            key,
            size,
            eTag: 'test-etag',
            sequencer: 'test-sequencer',
          },
        },
      },
    ],
  };

  return {
    messageId: 'test-message-id',
    receiptHandle: 'test-receipt-handle',
    body: JSON.stringify(s3Event),
    attributes: {},
    messageAttributes: {},
    md5OfBody: 'test-md5',
    eventSource: 'aws:sqs',
    eventSourceARN: 'arn:aws:sqs:us-east-1:123456789012:test-queue',
    awsRegion: 'us-east-1',
  } as SQSRecord;
}
