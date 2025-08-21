import { SQSEvent, SQSRecord, Context, Callback } from 'aws-lambda';

interface S3ObjectInfo {
  bucket: string;
  key: string;
  size: number;
  eventName: string;
}

interface S3EventFromSQS {
  Records: Array<{
    eventName: string;
    s3: {
      bucket: {
        name: string;
      };
      object: {
        key: string;
        size?: number;
      };
    };
  }>;
}

interface ApiCallResult {
  success: boolean;
  message: string;
  timestamp: string;
}

const API_BASE_URL =
  process.env.API_BASE_URL || 'https://api-dev.crittercanteen.com';
const DETECTION_ENDPOINT = process.env.DETECTION_ENDPOINT || '/detection';
const FEED_ENDPOINT = process.env.FEED_ENDPOINT || '/feed';

export const handler = async (
  event: SQSEvent,
  context: Context,
  callback: Callback,
): Promise<void> => {
  console.log('SQS Event received:', JSON.stringify(event, null, 2));

  try {
    const results: ApiCallResult[] = [];

    for (const record of event.Records) {
      const result = await processSQSRecord(record);
      results.push(result);
    }

    console.log('Processing results:', JSON.stringify(results, null, 2));

    const allSuccessful = results.every((result) => result.success);

    if (allSuccessful) {
      callback(null, {
        statusCode: 200,
        body: JSON.stringify({
          message: 'All SQS events processed successfully',
          results,
        }),
      });
    } else {
      callback(new Error('Some SQS events failed to process'), {
        statusCode: 500,
        body: JSON.stringify({
          message: 'Some SQS events failed to process',
          results,
        }),
      });
    }
  } catch (error) {
    console.error('Error processing SQS event:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';
    callback(new Error(errorMessage));
  }
};

async function processSQSRecord(record: SQSRecord): Promise<ApiCallResult> {
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

    await callAPI(s3Info);

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

function extractS3Info(record: SQSRecord): S3ObjectInfo {
  // Parse the S3 event data from the SQS message body...

  const s3Event = JSON.parse(record.body) as S3EventFromSQS;
  const s3Record = s3Event.Records[0];
  const s3 = s3Record.s3;

  return {
    bucket: s3.bucket.name,
    key: decodeURIComponent(s3.object.key.replace(/\+/g, ' ')),
    size: s3.object.size || 0,
    eventName: s3Record.eventName,
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

function getImageType(key: string): 'feed' | 'detection' {
  if (key.startsWith('feed/')) {
    return 'feed';
  } else if (key.startsWith('detection/')) {
    return 'detection';
  } else {
    // Default to detection for unknown paths
    return 'detection';
  }
}

async function callAPI(s3Info: S3ObjectInfo): Promise<void> {
  const imageType = getImageType(s3Info.key);
  const endpoint = imageType === 'feed' ? FEED_ENDPOINT : DETECTION_ENDPOINT;

  const payload = {
    imageUrl: `https://${s3Info.bucket}.s3.amazonaws.com/${s3Info.key}`,
  };

  console.log(
    `Calling ${imageType} API with payload:`,
    JSON.stringify(payload, null, 2),
  );

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
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

    console.log(`${imageType} API response:`, response.status, responseData);
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}
