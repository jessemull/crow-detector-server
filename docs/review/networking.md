# HTTP clients, timeouts, and CORS (NET)

**Review kinds:** pr, repo
**Applies when:** any outbound HTTP call, CORS change, or rate-limit change is in scope, and on every repo review.
**Policy:** `docs/ENVIRONMENT.md` (CORS).

## How to review

The API calls S3, Rekognition, Claude, and RDS. The Lambda and the Pi call the API. Each of those needs a timeout. CORS is what lets the Critter Canteen site read the public clip list; a wildcard opens it to every origin.

## Criteria

- **NET-01** (MUST) Every outbound HTTP call has a timeout. The Anthropic and AWS SDK clients set `requestHandler` or `timeout` rather than relying on the default where that default is unbounded. Verify: read each client constructor.
- **NET-02** (SHOULD) Retries use backoff and a maximum count. A 429 or 529 does not tight-loop. Verify: read the retry path.
- **NET-03** (MUST) Non-2xx responses are checked. A client that treats any completed request as success is a MUST. Verify: read the status branch.
- **NET-04** (MUST) CORS `origin` is the configured allow-list, not `*` or `true`, and `x-dev-mode` is not required for the public clip list. Verify: read `main.ts` and `src/config`.
- **NET-05** (SHOULD) The rate-limit guard keys on a value the caller cannot freely spoof. Behind the ALB, that is the proxy's forwarded client, and the store cannot grow without a bound. Verify: read `in-memory-rate-limit.guard.ts`.
- **NET-06** (SHOULD) Presigned-URL expiry is longer than the client's poll interval and shorter than a reasonable share window. Verify: compare the TTL with `docs/DEVICES.md` and the client poll, and use VERIFY if the client is not in this repo.

## Automatic-fail signals

- An HTTP client with no timeout on the Lambda or the Pi upload path.
- `origin: '*'` or `origin: true` on the API.
