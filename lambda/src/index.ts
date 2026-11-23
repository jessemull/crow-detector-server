import { Context, SQSBatchResponse, SQSEvent } from 'aws-lambda';
import { processSQSRecord } from './util';
import { lambdaLogger } from './util/logger';

/**
 * Reports each failed record in batchItemFailures so SQS retries only those
 * messages. A thrown error would retry the whole batch, including records
 * that already succeeded.
 */
export const handler = async (
  event: SQSEvent,
  context: Context,
): Promise<SQSBatchResponse> => {
  const records = event.Records ?? [];

  lambdaLogger.info('SQS event received', {
    recordCount: records.length,
    requestId: context.awsRequestId,
  });

  const batchItemFailures: SQSBatchResponse['batchItemFailures'] = [];

  for (const record of records) {
    try {
      const result = await processSQSRecord(record);

      if (!result.success) {
        batchItemFailures.push({ itemIdentifier: record.messageId });
      }
    } catch (error) {
      lambdaLogger.error('Error processing SQS record', {
        error: error instanceof Error ? error.message : String(error),
        messageId: record.messageId,
      });
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  lambdaLogger.info('SQS processing complete', {
    failureCount: batchItemFailures.length,
    successCount: records.length - batchItemFailures.length,
  });

  return { batchItemFailures };
};
