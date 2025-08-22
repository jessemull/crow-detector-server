import { S3ObjectInfo, S3EventFromSQS } from '../types';
import { SQSRecord } from 'aws-lambda';

export function extractS3Info(record: SQSRecord): S3ObjectInfo {
  try {
    const s3Event = JSON.parse(record.body) as S3EventFromSQS;

    if (!s3Event.Records || s3Event.Records.length === 0) {
      throw new Error('No Records array in S3 event');
    }

    const s3Record = s3Event.Records[0];

    if (!s3Record.s3) {
      throw new Error('No s3 object in S3 record');
    }

    const s3 = s3Record.s3;

    const result = {
      bucket: s3.bucket.name,
      key: decodeURIComponent(s3.object.key.replace(/\+/g, ' ')),
      size: s3.object.size || 0,
      eventName: s3Record.eventName,
    };

    return result;
  } catch (error) {
    console.error('Error in extractS3Info:', error);
    throw error;
  }
}
