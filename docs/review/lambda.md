# Lambda, SQS, and the S3 event path (LAM)

**Review kinds:** pr, repo
**Applies when:** any file under `lambda/` or `lambda/cloudformation/` is in scope, and on every repo review.
**Policy:** `docs/ARCHITECTURE.md` (Lambda package). **References:** AWS Lambda with SQS (batch item failures, visibility timeout), S3 event notification format.

## How to review

The function turns an S3 event delivered through SQS into a signed call to the Nest API. SQS deletes a message when the function returns success. A bug that returns success on failure loses the event. A bug that throws on one record retries the whole batch.

## Criteria

- **LAM-01** (MUST) Partial batch failure is reported (`batchItemFailures` / `ReportBatchItemFailures`) so one bad record does not retry or drop the others. Verify: read the handler return on both success and per-record failure.
- **LAM-02** (MUST) A failed API call does not look like success. Timeouts, 5xx, and network errors must surface; only a deliberate, documented duplicate (409) may be acknowledged. Verify: read the HTTP client and the status handling.
- **LAM-03** (MUST) Outbound HTTP has a timeout. Verify: read the request options.
- **LAM-04** (MUST) S3 keys from event records are URL-decoded, and `+` is handled as the encoding S3 uses. The code ignores `s3:TestEvent` payloads instead of treating them as objects. Verify: read the parser with a key that contains a space.
- **LAM-05** (SHOULD) The handler is safe when SQS redelivers the same record. The API call it makes is idempotent or the duplicate is recognized. Verify: trace a second delivery.
- **LAM-06** (MUST) The function runtime is Node 24 in the CloudFormation `Runtime`, the workflow `node-version`, and the webpack target. It does not import `../src`. Verify: compare the three and search for imports that leave `lambda/src`.
- **LAM-07** (SHOULD) The SQS visibility timeout is at least six times the function timeout, and a redrive policy with `maxReceiveCount` and a DLQ exists. Verify: read `lambda/cloudformation/`.
- **LAM-08** (MUST) The private key is read from the runtime environment, never logged, and never baked into the webpack bundle. Verify: read `webpack.config.js` `DefinePlugin` usage and the auth module.
- **LAM-09** (SHOULD) Logs name the bucket and key and the API status, and do not include the signed string, the key, or the full SQS body. Verify: read the logger calls.

## Automatic-fail signals

- A handler that returns success when the API call failed.
- An S3 key used without decoding.
- A private key in the bundle or the logs.
