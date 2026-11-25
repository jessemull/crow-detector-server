import { ApiCallResult } from '../types';
import { SQSRecord } from 'aws-lambda';
import { callAPI } from './api';
import { extractS3Records } from './s3';
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

    const objects = extractS3Records(record);
    const processed: string[] = [];
    const skipped: string[] = [];

    for (const s3Info of objects) {
      lambdaLogger.info('Processing S3 object', {
        bucket: s3Info.bucket,
        eventName: s3Info.eventName,
        key: s3Info.key,
        size: s3Info.size,
      });

      if (!isImageFile(s3Info.key)) {
        skipped.push(`Skipped non-image file: ${s3Info.key}`);
        continue;
      }

      if (!isRelevantEvent(s3Info.eventName)) {
        skipped.push(`Skipped non-upload event: ${s3Info.eventName}`);
        continue;
      }

      await callAPI(s3Info);
      processed.push(s3Info.key);
    }

    if (processed.length === 0) {
      return {
        success: true,
        message: skipped[0] ?? 'Skipped every record',
        timestamp: new Date().toISOString(),
      };
    }

    return {
      success: true,
      message: `Successfully processed: ${processed.join(', ')}`,
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
