import { S3Event, S3EventRecord, Context, Callback } from 'aws-lambda';

interface S3ObjectInfo {
  bucket: string;
  key: string;
  size: number;
  eventName: string;
}

interface ApiCallResult {
  success: boolean;
  message: string;
  timestamp: string;
}

const API_BASE_URL =
  process.env.API_BASE_URL || 'https://api-dev.crittercanteen.com';
const API_ENDPOINT =
  process.env.API_ENDPOINT || '/detection/crow-detected-event';

export const handler = async (
  event: S3Event,
  context: Context,
  callback: Callback,
): Promise<void> => {
  console.log('S3 Event received:', JSON.stringify(event, null, 2));

  try {
    const results: ApiCallResult[] = [];

    for (const record of event.Records) {
      const result = await processS3Record(record);
      results.push(result);
    }

    console.log('Processing results:', JSON.stringify(results, null, 2));

    const allSuccessful = results.every((result) => result.success);
    if (allSuccessful) {
      callback(null, {
        statusCode: 200,
        body: JSON.stringify({
          message: 'All S3 events processed successfully',
          results,
        }),
      });
    } else {
      callback(new Error('Some S3 events failed to process'), {
        statusCode: 500,
        body: JSON.stringify({
          message: 'Some S3 events failed to process',
          results,
        }),
      });
    }
  } catch (error) {
    console.error('Error processing S3 event:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';
    callback(new Error(errorMessage));
  }
};

async function processS3Record(record: S3EventRecord): Promise<ApiCallResult> {
  try {
    const s3Info = extractS3Info(record);
    console.log('Processing S3 object:', JSON.stringify(s3Info, null, 2));

    if (!isImageFile(s3Info.key)) {
      return {
        success: true,
        message: `Skipped non-image file: ${s3Info.key}`,
        timestamp: new Date().toISOString(),
      };
    }

    if (!isRelevantEvent(s3Info.eventName)) {
      return {
        success: true,
        message: `Skipped non-upload event: ${s3Info.eventName}`,
        timestamp: new Date().toISOString(),
      };
    }

    await callDetectionAPI(s3Info);

    return {
      success: true,
      message: `Successfully processed: ${s3Info.key}`,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error processing S3 record:', error);
    return {
      success: false,
      message: `Failed to process: ${error instanceof Error ? error.message : 'Unknown error'}`,
      timestamp: new Date().toISOString(),
    };
  }
}

function extractS3Info(record: S3EventRecord): S3ObjectInfo {
  const s3 = record.s3;
  return {
    bucket: s3.bucket.name,
    key: decodeURIComponent(s3.object.key.replace(/\+/g, ' ')),
    size: s3.object.size || 0,
    eventName: record.eventName,
  };
}

function isImageFile(key: string): boolean {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
  const lowerKey = key.toLowerCase();
  return imageExtensions.some((ext) => lowerKey.endsWith(ext));
}

function isRelevantEvent(eventName: string): boolean {
  return (
    eventName === 'ObjectCreated:Put' || eventName === 'ObjectCreated:Post'
  );
}

async function callDetectionAPI(s3Info: S3ObjectInfo): Promise<void> {
  const payload = {
    imageUrl: `https://${s3Info.bucket}.s3.amazonaws.com/${s3Info.key}`,
    confidence: 0.85,
    timestamp: Date.now(),
    source: 's3-lambda',
    metadata: {
      bucket: s3Info.bucket,
      key: s3Info.key,
      size: s3Info.size,
      eventName: s3Info.eventName,
    },
  };

  console.log('Calling API with payload:', JSON.stringify(payload, null, 2));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`${API_BASE_URL}${API_ENDPOINT}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'crow-detector-s3-lambda/1.0.0',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`API call failed with status: ${response.status}`);
    }

    const responseData = await response.json();
    console.log('API response:', response.status, responseData);
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}
