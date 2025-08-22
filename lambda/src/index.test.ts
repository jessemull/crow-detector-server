import { SQSEvent, SQSRecord, Context, Callback } from 'aws-lambda';

process.env.LAMBDA_S3_PRIVATE_KEY = Buffer.from(
  `-----BEGIN EC PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgR3AvaHdwoFmc/ZPp
OM1i6/Mi8hIOhEsdWXm8iFHYAQhabVoAoGCCqGSM49AwEHoUQDQgAE8OmBTWgAbW
BgKdDZ7TihYwGHxEdOQsjr/tP6Npnrrmr04+ANVy43H57PBfjPSG90Tb8VOVV6c5
Pq8qB9wBHipQ==
-----END EC PRIVATE KEY-----`,
).toString('base64');

import { handler } from './index';

global.fetch = jest.fn();
const mockedFetch = global.fetch as jest.MockedFunction<typeof fetch>;

jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  createSign: jest.fn(() => ({
    update: jest.fn(),
    sign: jest.fn(() => 'mocked-signature'),
  })),
}));

describe('S3 Event Lambda Handler', () => {
  let mockContext: Context;
  let mockCallback: jest.MockedFunction<Callback>;

  beforeEach(() => {
    mockContext = {} as Context;
    mockCallback = jest.fn();

    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    process.env.NODE_ENV = 'test';
    process.env.API_BASE_URL = 'https://test-api.com';
    process.env.API_ENDPOINT = '/test-endpoint';
  });

  afterEach(() => {
    jest.restoreAllMocks();

    delete process.env.NODE_ENV;
    delete process.env.API_BASE_URL;
    delete process.env.API_ENDPOINT;
  });

  describe('handler', () => {
    it('should process SQS event with S3 data successfully', async () => {
      const mockEvent: SQSEvent = {
        Records: [
          createMockSQSRecord(
            'test-bucket',
            'detection/test-image.jpg',
            'ObjectCreated:Put',
          ),
        ],
      };

      mockedFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      } as Response);

      await handler(mockEvent, mockContext, mockCallback);

      expect(mockCallback).toHaveBeenCalledWith(null, {
        statusCode: 200,
        body: expect.stringContaining(
          'All SQS events processed successfully',
        ) as string,
      });
      expect(mockedFetch).toHaveBeenCalledWith(
        'https://api-dev.crittercanteen.com/detection',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }) as Record<string, string>,
          body: expect.stringContaining('test-image.jpg') as string,
        }) as RequestInit,
      );
    });

    it('should hit handler-level catch block', async () => {
      const mockEvent: SQSEvent = {
        Records: [
          createMockSQSRecord(
            'test-bucket',
            'detection/image.jpg',
            'ObjectCreated:Put',
          ),
        ],
      };

      const util = await import('./util');
      jest.spyOn(util, 'processSQSRecord').mockImplementationOnce(() => {
        throw new Error('Forced handler-level error');
      });

      await handler(mockEvent, mockContext, mockCallback);

      expect(mockCallback).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should hit handler-level catch block with non-string error', async () => {
      const mockEvent: SQSEvent = {
        Records: [
          createMockSQSRecord(
            'test-bucket',
            'detection/image.jpg',
            'ObjectCreated:Put',
          ),
        ],
      };

      const util = await import('./util');
      jest.spyOn(util, 'processSQSRecord').mockImplementationOnce(() => {
        throw 'string error';
      });

      await handler(mockEvent, mockContext, mockCallback);

      expect(mockCallback).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should handle mixed success/failure results', async () => {
      const mockEvent: SQSEvent = {
        Records: [
          createMockSQSRecord(
            'test-bucket',
            'detection/success-image.jpg',
            'ObjectCreated:Put',
          ),
          createMockSQSRecord(
            'test-bucket',
            'detection/failure-image.jpg',
            'ObjectCreated:Put',
          ),
        ],
      };

      // First call succeeds, second call fails
      mockedFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true }),
        } as Response)
        .mockRejectedValueOnce(new Error('API call failed'));

      await handler(mockEvent, mockContext, mockCallback);

      expect(mockCallback).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          statusCode: 500,
          body: expect.stringContaining('Some SQS events failed to process'),
        }),
      );
    });

    it('should handle handler-level errors', async () => {
      const mockEvent: SQSEvent = {
        Records: [
          {
            messageId: 'test-message-id',
            receiptHandle: 'test-receipt-handle',
            body: 'invalid-json',
            attributes: {
              ApproximateReceiveCount: '1',
              SentTimestamp: '1234567890',
              SenderId: 'test-sender',
              ApproximateFirstReceiveTimestamp: '1234567890',
            },
            messageAttributes: {},
            md5OfBody: 'test-md5',
            eventSource: 'aws:sqs',
            eventSourceARN: 'arn:aws:sqs:us-east-1:123456789012:test-queue',
            awsRegion: 'us-east-1',
          },
        ],
      };

      await handler(mockEvent, mockContext, mockCallback);

      expect(mockCallback).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          statusCode: 500,
          body: expect.stringContaining('Some SQS events failed to process'),
        }),
      );
    });

    it('should skip non-image files', async () => {
      const mockEvent: SQSEvent = {
        Records: [
          createMockSQSRecord(
            'test-bucket',
            'test-document.pdf',
            'ObjectCreated:Put',
          ),
        ],
      };

      await handler(mockEvent, mockContext, mockCallback);

      expect(mockCallback).toHaveBeenCalledWith(null, {
        statusCode: 200,
        body: expect.stringContaining(
          'All SQS events processed successfully',
        ) as string,
      });
      expect(mockedFetch).not.toHaveBeenCalled();
    });

    it('should route feed images to feed endpoint', async () => {
      const mockEvent: SQSEvent = {
        Records: [
          createMockSQSRecord(
            'test-bucket',
            'feed/1234567890-image.jpg',
            'ObjectCreated:Put',
          ),
        ],
      };

      mockedFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      } as Response);

      await handler(mockEvent, mockContext, mockCallback);

      expect(mockedFetch).toHaveBeenCalledWith(
        'https://api-dev.crittercanteen.com/feed',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }) as Record<string, string>,
          body: expect.stringContaining('feed/1234567890-image.jpg') as string,
        }) as RequestInit,
      );
    });

    it('should skip non-upload events', async () => {
      const mockEvent: SQSEvent = {
        Records: [
          createMockSQSRecord(
            'test-bucket',
            'detection/test-image.jpg',
            'ObjectRemoved:Delete',
          ),
        ],
      };

      await handler(mockEvent, mockContext, mockCallback);

      expect(mockCallback).toHaveBeenCalledWith(null, {
        statusCode: 200,
        body: expect.stringContaining(
          'All SQS events processed successfully',
        ) as string,
      });
      expect(mockedFetch).not.toHaveBeenCalled();
    });

    it('should handle multiple records', async () => {
      const mockEvent: SQSEvent = {
        Records: [
          createMockSQSRecord(
            'test-bucket',
            'detection/image1.jpg',
            'ObjectCreated:Put',
          ),
          createMockSQSRecord(
            'test-bucket',
            'detection/image2.png',
            'ObjectCreated:Post',
          ),
        ],
      };

      mockedFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true }),
        } as Response);

      await handler(mockEvent, mockContext, mockCallback);

      expect(mockedFetch).toHaveBeenCalledTimes(2);
      expect(mockCallback).toHaveBeenCalledWith(null, {
        statusCode: 200,
        body: expect.stringContaining(
          'All SQS events processed successfully',
        ) as string,
      });
    });

    it('should handle API call failures', async () => {
      const mockEvent: SQSEvent = {
        Records: [
          createMockSQSRecord(
            'test-bucket',
            'detection/test-image.jpg',
            'ObjectCreated:Put',
          ),
        ],
      };

      mockedFetch.mockRejectedValueOnce(new Error('API call failed'));

      await handler(mockEvent, mockContext, mockCallback);

      expect(mockCallback).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          statusCode: 500,
          body: expect.stringContaining('Some SQS events failed to process'),
        }),
      );
    });

    it('should handle general errors', async () => {
      const mockEvent: SQSEvent = {
        Records: [
          createMockSQSRecord(
            'test-bucket',
            'detection/test-image.jpg',
            'ObjectCreated:Put',
          ),
        ],
      };

      mockedFetch.mockImplementationOnce(() => {
        throw new Error('Unexpected error');
      });

      await handler(mockEvent, mockContext, mockCallback);

      expect(mockCallback).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          statusCode: 500,
          body: expect.stringContaining('Some SQS events failed to process'),
        }),
      );
    });

    it('should use default API URL when environment variable is not set', async () => {
      delete process.env.API_BASE_URL;

      const mockEvent: SQSEvent = {
        Records: [
          createMockSQSRecord(
            'test-bucket',
            'detection/test-image.jpg',
            'ObjectCreated:Put',
          ),
        ],
      };

      mockedFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      } as Response);

      await handler(mockEvent, mockContext, mockCallback);

      expect(mockedFetch).toHaveBeenCalledWith(
        'https://api-dev.crittercanteen.com/detection',
        expect.any(Object),
      );
    });
  });

  describe('image file detection', () => {
    it('should recognize various image extensions', () => {
      const mockEvent: SQSEvent = {
        Records: [
          createMockSQSRecord(
            'test-bucket',
            'detection/image.jpg',
            'ObjectCreated:Put',
          ),
          createMockSQSRecord(
            'test-bucket',
            'detection/image.jpeg',
            'ObjectCreated:Put',
          ),
          createMockSQSRecord(
            'test-bucket',
            'detection/image.png',
            'ObjectCreated:Put',
          ),
          createMockSQSRecord(
            'test-bucket',
            'detection/image.gif',
            'ObjectCreated:Put',
          ),
          createMockSQSRecord(
            'test-bucket',
            'detection/image.bmp',
            'ObjectCreated:Put',
          ),
          createMockSQSRecord(
            'test-bucket',
            'detection/image.webp',
            'ObjectCreated:Put',
          ),
        ],
      };

      mockedFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      } as Response);

      return handler(mockEvent, mockContext, mockCallback).then(() => {
        expect(mockedFetch).toHaveBeenCalledTimes(6);
      });
    });

    it('should handle case-insensitive extensions', () => {
      const mockEvent: SQSEvent = {
        Records: [
          createMockSQSRecord(
            'test-bucket',
            'detection/image.JPG',
            'ObjectCreated:Put',
          ),
          createMockSQSRecord(
            'test-bucket',
            'detection/image.PNG',
            'ObjectCreated:Put',
          ),
        ],
      };

      mockedFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      } as Response);

      return handler(mockEvent, mockContext, mockCallback).then(() => {
        expect(mockedFetch).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('event filtering', () => {
    it('should process ObjectCreated:Put events', () => {
      const mockEvent: SQSEvent = {
        Records: [
          createMockSQSRecord(
            'test-bucket',
            'detection/test-image.jpg',
            'ObjectCreated:Put',
          ),
        ],
      };

      mockedFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      } as Response);

      return handler(mockEvent, mockContext, mockCallback).then(() => {
        expect(mockedFetch).toHaveBeenCalledTimes(1);
      });
    });

    it('should process ObjectCreated:Post events', () => {
      const mockEvent: SQSEvent = {
        Records: [
          createMockSQSRecord(
            'test-bucket',
            'detection/test-image.jpg',
            'ObjectCreated:Post',
          ),
        ],
      };

      mockedFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      } as Response);

      return handler(mockEvent, mockContext, mockCallback).then(() => {
        expect(mockedFetch).toHaveBeenCalledTimes(1);
      });
    });

    it('should skip ObjectRemoved events', () => {
      const mockEvent: SQSEvent = {
        Records: [
          createMockSQSRecord(
            'test-bucket',
            'detection/test-image.jpg',
            'ObjectRemoved:Delete',
          ),
        ],
      };

      return handler(mockEvent, mockContext, mockCallback).then(() => {
        expect(mockedFetch).not.toHaveBeenCalled();
      });
    });

    it('should handle unknown image paths with error', async () => {
      const mockEvent: SQSEvent = {
        Records: [
          createMockSQSRecord(
            'test-bucket',
            'unknown-path/image.jpg',
            'ObjectCreated:Put',
          ),
        ],
      };

      await handler(mockEvent, mockContext, mockCallback);

      expect(mockCallback).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          statusCode: 500,
          body: expect.stringContaining('Some SQS events failed to process'),
        }),
      );
    });

    it('should handle API call with non-ok response', async () => {
      const mockEvent: SQSEvent = {
        Records: [
          createMockSQSRecord(
            'test-bucket',
            'detection/test-image.jpg',
            'ObjectCreated:Put',
          ),
        ],
      };

      mockedFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Internal server error' }),
      } as Response);

      await handler(mockEvent, mockContext, mockCallback);

      expect(mockCallback).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          statusCode: 500,
          body: expect.stringContaining('Some SQS events failed to process'),
        }),
      );
    });

    it('should handle API call timeout', async () => {
      const mockEvent: SQSEvent = {
        Records: [
          createMockSQSRecord(
            'test-bucket',
            'detection/test-image.jpg',
            'ObjectCreated:Put',
          ),
        ],
      };

      // Mock fetch to throw an AbortError to simulate timeout
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockedFetch.mockRejectedValueOnce(abortError);

      await handler(mockEvent, mockContext, mockCallback);

      expect(mockCallback).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          statusCode: 500,
          body: expect.stringContaining('Some SQS events failed to process'),
        }),
      );
    });

    it('should handle fetch error during API call', async () => {
      const mockEvent: SQSEvent = {
        Records: [
          createMockSQSRecord(
            'test-bucket',
            'detection/test-image.jpg',
            'ObjectCreated:Put',
          ),
        ],
      };

      mockedFetch.mockRejectedValueOnce(new Error('Network error'));

      await handler(mockEvent, mockContext, mockCallback);

      expect(mockCallback).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          statusCode: 500,
          body: expect.stringContaining('Some SQS events failed to process'),
        }),
      );
    });

    it('should handle non-test environment logging', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const mockEvent: SQSEvent = {
        Records: [
          createMockSQSRecord(
            'test-bucket',
            'detection/test-image.jpg',
            'ObjectCreated:Put',
          ),
        ],
      };

      mockedFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      } as Response);

      const consoleLogSpy = jest
        .spyOn(console, 'log')
        .mockImplementation(() => {});

      await handler(mockEvent, mockContext, mockCallback);

      expect(consoleLogSpy).toHaveBeenCalled();

      process.env.NODE_ENV = originalNodeEnv;
      consoleLogSpy.mockRestore();
    });

    it('should handle JSON parsing errors in catch block', async () => {
      // Create an event that will cause a JSON parsing error
      const mockEvent: SQSEvent = {
        Records: [
          {
            messageId: 'test-message-id',
            receiptHandle: 'test-receipt-handle',
            body: 'invalid-json-that-will-cause-error', // This will cause JSON.parse to fail
            attributes: {
              ApproximateReceiveCount: '1',
              SentTimestamp: '1234567890',
              SenderId: 'test-sender',
              ApproximateFirstReceiveTimestamp: '1234567890',
            },
            messageAttributes: {},
            md5OfBody: 'test-md5',
            eventSource: 'aws:sqs',
            eventSourceARN: 'arn:aws:sqs:us-east-1:123456789012:test-queue',
            awsRegion: 'us-east-1',
          },
        ],
      };

      await handler(mockEvent, mockContext, mockCallback);

      expect(mockCallback).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          statusCode: 500,
          body: expect.stringContaining('Some SQS events failed to process'),
        }),
      );
    });
  });
});

function createMockSQSRecord(
  bucket: string,
  key: string,
  eventName: string,
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
            size: 1024,
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
