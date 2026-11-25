import { NodeHttpHandler } from '@smithy/node-http-handler';

/** Bound every AWS call. The SDK default request timeout is unbounded. */
export const AWS_REQUEST_TIMEOUT_MS = 10_000;
export const AWS_CONNECTION_TIMEOUT_MS = 5_000;

export function awsClientOptions(region: string): {
  region: string;
  requestHandler: NodeHttpHandler;
} {
  return {
    region,
    requestHandler: new NodeHttpHandler({
      connectionTimeout: AWS_CONNECTION_TIMEOUT_MS,
      requestTimeout: AWS_REQUEST_TIMEOUT_MS,
    }),
  };
}

/**
 * Presigning a body-less PutObject must not checksum empty bytes.
 * WHEN_REQUIRED skips the default CRC32 until the caller supplies a body.
 */
export function s3ClientOptions(region: string): {
  region: string;
  requestHandler: NodeHttpHandler;
  requestChecksumCalculation: 'WHEN_REQUIRED';
  responseChecksumValidation: 'WHEN_REQUIRED';
} {
  return {
    ...awsClientOptions(region),
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  };
}
