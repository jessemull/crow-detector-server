import { SQSEvent, Context } from 'aws-lambda';
import { processSQSRecord } from './util';
import { ApiCallResult } from './types';
import { lambdaLogger } from './util/logger';

export interface HandlerResult {
  statusCode: number;
  body: string;
}

/**
 * Async handler (Node.js 24+ Lambda runtimes no longer support callback-style handlers).
 */
export const handler = async (
  event: SQSEvent,
  context: Context,
): Promise<HandlerResult> => {
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
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'All SQS events processed successfully',
          results,
        }),
      };
    }

    throw new Error('Some SQS events failed to process');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    lambdaLogger.error('Error processing SQS event', { error: errorMessage });
    throw new Error(errorMessage, { cause: error });
  }
};
