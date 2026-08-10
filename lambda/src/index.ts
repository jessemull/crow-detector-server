import { SQSEvent, Context, Callback } from 'aws-lambda';
import { processSQSRecord } from './util';
import { ApiCallResult } from './types';
import { lambdaLogger } from './util/logger';

export const handler = async (
  event: SQSEvent,
  context: Context,
  callback: Callback,
): Promise<void> => {
  lambdaLogger.info('SQS event received', {
    recordCount: event.Records?.length ?? 0,
    requestId: context.awsRequestId,
  });

  try {
    const results: ApiCallResult[] = [];

    for (const record of event.Records) {
      const result = await processSQSRecord(record);
      results.push(result);
    }

    lambdaLogger.info('SQS processing complete', {
      failureCount: results.filter((result) => !result.success).length,
      successCount: results.filter((result) => result.success).length,
    });

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
    const errorMessage = error instanceof Error ? error.message : String(error);
    lambdaLogger.error('Error processing SQS event', { error: errorMessage });
    callback(new Error(errorMessage));
  }
};
