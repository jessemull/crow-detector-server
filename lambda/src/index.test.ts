import { S3Event, S3EventRecord, Context, Callback } from 'aws-lambda';
import { handler } from './index';

global.fetch = jest.fn();
const mockedFetch = global.fetch as jest.MockedFunction<typeof fetch>;

describe('S3 Event Lambda Handler', () => {
  let mockContext: Context;
  let mockCallback: jest.MockedFunction<Callback>;

  beforeEach(() => {
    mockContext = {} as Context;
    mockCallback = jest.fn();
    jest.clearAllMocks();
    process.env.API_BASE_URL = 'https://test-api.com';
    process.env.API_ENDPOINT = '/test-endpoint';
  });

  afterEach(() => {
    delete process.env.API_BASE_URL;
    delete process.env.API_ENDPOINT;
  });

  describe('handler', () => {
    it('should process S3 event successfully', async () => {
      const mockEvent: S3Event = {
        Records: [
          createMockS3Record(
            'test-bucket',
            'test-image.jpg',
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
          'All S3 events processed successfully',
        ) as string,
      });
      expect(mockedFetch).toHaveBeenCalledWith(
        'https://api-dev.crittercanteen.com/detection/crow-detected-event',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }) as Record<string, string>,
          body: expect.stringContaining('test-image.jpg') as string,
        }) as RequestInit,
      );
    });

    it('should skip non-image files', async () => {
      const mockEvent: S3Event = {
        Records: [
          createMockS3Record(
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
          'All S3 events processed successfully',
        ) as string,
      });
      expect(mockedFetch).not.toHaveBeenCalled();
    });

    it('should skip non-upload events', async () => {
      const mockEvent: S3Event = {
        Records: [
          createMockS3Record(
            'test-bucket',
            'test-image.jpg',
            'ObjectRemoved:Delete',
          ),
        ],
      };

      await handler(mockEvent, mockContext, mockCallback);

      expect(mockCallback).toHaveBeenCalledWith(null, {
        statusCode: 200,
        body: expect.stringContaining(
          'All S3 events processed successfully',
        ) as string,
      });
      expect(mockedFetch).not.toHaveBeenCalled();
    });

    it('should handle multiple records', async () => {
      const mockEvent: S3Event = {
        Records: [
          createMockS3Record('test-bucket', 'image1.jpg', 'ObjectCreated:Put'),
          createMockS3Record('test-bucket', 'image2.png', 'ObjectCreated:Post'),
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

      expect(mockCallback).toHaveBeenCalledWith(null, {
        statusCode: 200,
        body: expect.stringContaining(
          'All S3 events processed successfully',
        ) as string,
      });
      expect(mockedFetch).toHaveBeenCalledTimes(2);
    });

    it('should handle API call failures', async () => {
      const mockEvent: S3Event = {
        Records: [
          createMockS3Record(
            'test-bucket',
            'test-image.jpg',
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
          body: expect.stringContaining(
            'Some S3 events failed to process',
          ) as string,
        }) as { statusCode: number; body: string },
      );
    });

    it('should handle general errors', async () => {
      const mockEvent: S3Event = {
        Records: [
          createMockS3Record(
            'test-bucket',
            'test-image.jpg',
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
          body: expect.stringContaining(
            'Some S3 events failed to process',
          ) as string,
        }) as { statusCode: number; body: string },
      );
    });

    it('should use default API URL when environment variable is not set', async () => {
      delete process.env.API_BASE_URL;
      delete process.env.API_ENDPOINT;

      const mockEvent: S3Event = {
        Records: [
          createMockS3Record(
            'test-bucket',
            'test-image.jpg',
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
        'https://api-dev.crittercanteen.com/detection/crow-detected-event',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }) as Record<string, string>,
        }) as RequestInit,
      );
    });
  });

  describe('image file detection', () => {
    it('should recognize various image extensions', () => {
      const mockEvent: S3Event = {
        Records: [
          createMockS3Record('test-bucket', 'image.jpg', 'ObjectCreated:Put'),
          createMockS3Record('test-bucket', 'image.jpeg', 'ObjectCreated:Put'),
          createMockS3Record('test-bucket', 'image.png', 'ObjectCreated:Put'),
          createMockS3Record('test-bucket', 'image.gif', 'ObjectCreated:Put'),
          createMockS3Record('test-bucket', 'image.bmp', 'ObjectCreated:Put'),
          createMockS3Record('test-bucket', 'image.webp', 'ObjectCreated:Put'),
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
      const mockEvent: S3Event = {
        Records: [
          createMockS3Record('test-bucket', 'image.JPG', 'ObjectCreated:Put'),
          createMockS3Record('test-bucket', 'image.PNG', 'ObjectCreated:Put'),
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
      const mockEvent: S3Event = {
        Records: [
          createMockS3Record(
            'test-bucket',
            'test-image.jpg',
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
      const mockEvent: S3Event = {
        Records: [
          createMockS3Record(
            'test-bucket',
            'test-image.jpg',
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
      const mockEvent: S3Event = {
        Records: [
          createMockS3Record(
            'test-bucket',
            'test-image.jpg',
            'ObjectRemoved:Delete',
          ),
        ],
      };

      return handler(mockEvent, mockContext, mockCallback).then(() => {
        expect(mockedFetch).not.toHaveBeenCalled();
      });
    });
  });
});

function createMockS3Record(
  bucket: string,
  key: string,
  eventName: string,
): S3EventRecord {
  return {
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
  } as S3EventRecord;
}
