import { SQSEvent, Context, Callback } from 'aws-lambda';
import { processSQSRecord } from './util';
import { ApiCallResult } from './types';

export const handler = async (
  event: SQSEvent,
  context: Context,
  callback: Callback,
): Promise<void> => {
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
