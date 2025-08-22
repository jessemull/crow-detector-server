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
  console.log('Lambda started');
  console.log('Event type:', typeof event);
  console.log('Event keys:', Object.keys(event));

  if (event.Records && event.Records.length > 0) {
    console.log('Number of records:', event.Records.length);
    console.log('First record keys:', Object.keys(event.Records[0]));
    console.log('First record body:', event.Records[0].body);
    console.log('First record body type:', typeof event.Records[0].body);
  } else {
    console.log('No records found in event');
  }

  if (process.env.NODE_ENV !== 'test') {
    console.log('SQS Event received:', JSON.stringify(event, null, 2));
  }

  try {
    const results: ApiCallResult[] = [];

    for (const record of event.Records) {
      const result = await processSQSRecord(record);
      results.push(result);
    }

    if (process.env.NODE_ENV !== 'test') {
      console.log('Processing results:', JSON.stringify(results, null, 2));
    }

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
    console.error(
      'Error processing SQS event:',
      error instanceof Error ? error.message : String(error),
    );
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';
    callback(new Error(errorMessage));
  }
};

async function processSQSRecord(record: SQSRecord): Promise<ApiCallResult> {
  try {
    const s3Info = extractS3Info(record);

    if (process.env.NODE_ENV !== 'test') {
      console.log('Processing S3 object:', JSON.stringify(s3Info, null, 2));
    }

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
    console.error(
      'Error processing S3 record:',
      error instanceof Error ? error.message : String(error),
    );
    return {
      success: false,
      message: `Failed to process: ${error instanceof Error ? error.message : 'Unknown error'}`,
      timestamp: new Date().toISOString(),
    };
  }
}

function extractS3Info(record: SQSRecord): S3ObjectInfo {
  console.log(
    'extractS3Info called with record:',
    JSON.stringify(record, null, 2),
  );

  try {
    // Parse the S3 event data from the SQS message body...
    console.log('Attempting to parse record.body:', record.body);

    const s3Event = JSON.parse(record.body) as S3EventFromSQS;
    console.log('Parsed S3 event:', JSON.stringify(s3Event, null, 2));

    if (!s3Event.Records || s3Event.Records.length === 0) {
      throw new Error('No Records array in S3 event');
    }

    const s3Record = s3Event.Records[0];
    console.log('S3 record:', JSON.stringify(s3Record, null, 2));

    if (!s3Record.s3) {
      throw new Error('No s3 object in S3 record');
    }

    const s3 = s3Record.s3;
    console.log('S3 object:', JSON.stringify(s3, null, 2));

    const result = {
      bucket: s3.bucket.name,
      key: decodeURIComponent(s3.object.key.replace(/\+/g, ' ')),
      size: s3.object.size || 0,
      eventName: s3Record.eventName,
    };

    console.log('Extracted S3 info:', JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    console.error('Error in extractS3Info:', error);
    console.error('Record that caused error:', JSON.stringify(record, null, 2));
    throw error;
  }
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
    throw new Error(
      `Cannot determine image type from S3 key path: ${key}. Expected path to start with 'feed/' or 'detection/'`,
    );
  }
}

async function callAPI(s3Info: S3ObjectInfo): Promise<void> {
  const imageType = getImageType(s3Info.key);
  const endpoint = imageType === 'feed' ? FEED_ENDPOINT : DETECTION_ENDPOINT;

  const payload = {
    imageUrl: `https://${s3Info.bucket}.s3.amazonaws.com/${s3Info.key}`,
  };

  if (process.env.NODE_ENV !== 'test') {
    console.log(
      `Calling ${imageType} API with payload:`,
      JSON.stringify(payload, null, 2),
    );
  }

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

    if (process.env.NODE_ENV !== 'test') {
      console.log(`${imageType} API response:`, response.status, responseData);
    }
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}
