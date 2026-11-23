# Logging and health (OBS)

**Review kinds:** pr, repo
**Applies when:** any log call, health check, or logger config is in scope, and on every repo review.
**Policy:** `AGENTS.md` (Logging), `docs/SECURITY.md` (Logging).

## How to review

Logs are how ECS and Lambda failures get diagnosed, and they are also where secrets leak. Read every new log statement and the object it receives.

## Criteria

- **OBS-01** (MUST) Nest code uses the bunyan logger from `src/common/logger`. New `console.log` in `src/` is a finding. Lambda uses its structured logger. Verify: search `console.` in changed production files.
- **OBS-02** (MUST) Log objects do not contain tokens, signatures, API keys, key prefixes, passwords, private keys, signed URLs, or the RTSP URL. Verify: read each logged object.
- **OBS-03** (SHOULD) Errors log the operation, the id, and the status, not the full request body, SQS body, or image bytes. Verify: read the error logs.
- **OBS-04** (SHOULD) The health endpoint reflects dependency failure when it claims to (`@nestjs/terminus` checks that are wired), and it does not require device auth. Verify: read `src/health`.
- **OBS-05** (SHOULD) A caught error that the caller does not see is logged once at `error` or `warn` with the cause. Verify: read each `catch`.
- **OBS-06** (NICE) Log level comes from `LOG_LEVEL` and production defaults to `info`. Verify: read the logger config.

## Automatic-fail signals

- A secret, signed URL, or RTSP password in a log statement.
- `console.log` of a request or event body in `src/` or `lambda/src`.
