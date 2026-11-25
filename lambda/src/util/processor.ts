import { ApiCallResult } from '../types';
import { SQSRecord } from 'aws-lambda';
import { callAPI } from './api';
import { extractS3Info } from './s3';
import { isImageFile, isRelevantEvent } from './images';
import { lambdaLogger } from './logger';

export async function processSQSRecord(
  record: SQSRecord,
): Promise<ApiCallResult> {
  try {
    try {
      const body = JSON.parse(record.body) as { Event?: string };
      if (body.Event === 's3:TestEvent') {
        return {
          success: true,
          message: 'Ignored S3 test event',
          timestamp: new Date().toISOString(),
        };
      }
    } catch {
      // Malformed bodies are reported by extractS3Info.
    }

    const s3Info = extractS3Info(record);

    lambdaLogger.info('Processing S3 object', {
      bucket: s3Info.bucket,
      eventName: s3Info.eventName,
      key: s3Info.key,
      size: s3Info.size,
    });

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
    lambdaLogger.error('Error processing S3 record', {
      error: error instanceof Error ? error.message : String(error),
      messageId: record.messageId,
    });
    return {
      success: false,
      message: `Failed to process: ${error instanceof Error ? error.message : 'Unknown error'}`,
      timestamp: new Date().toISOString(),
    };
  }
}
