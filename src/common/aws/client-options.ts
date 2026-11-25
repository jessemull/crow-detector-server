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
