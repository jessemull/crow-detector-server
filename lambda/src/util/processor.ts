import { ApiCallResult } from '../types';
import { SQSRecord } from 'aws-lambda';
import { callAPI } from './api';
import { extractS3Info } from './s3';
import { isImageFile, isRelevantEvent } from './images';

export async function processSQSRecord(
  record: SQSRecord,
): Promise<ApiCallResult> {
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
