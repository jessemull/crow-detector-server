# Lambda / photo event path (LAM) — removed

**Review kinds:** pr, repo
**Applies when:** a change tries to reintroduce `lambda/`, SQS photo notifications, or `feed/` / `detection/` still uploads.
**Policy:** the still-photo S3 → SQS → Lambda → Nest `/feed` / `/detection` path has been deleted. Feeder classify uses Nest `ClaudeService` only.

## How to review

There is no nested `lambda/` package and no photo event queue. If a diff adds one, treat it as an architecture change that needs human approval (`docs/GOVERNANCE.md`).

## Criteria

- **LAM-01** (MUST) Do not add a photo-pipeline Lambda, SQS queue for `feed/`/`detection/`, or S3 bucket notifications that revive that path. Verify: search the diff for `lambda/`, `crow-detector-s3-events`, `NotificationConfiguration`, `PI_MOTION`, `LAMBDA_S3`, `/urls/feed`, `/urls/detection`.
- **LAM-02** (MUST) Feeder animal sampling stays on `POST /feeder/classify` + `ClaudeService`. Verify: feeder recorder and host controller still call that route, not a deleted detection controller.

## Automatic-fail signals

- Reintroducing the nested `lambda/` package or photo SQS stack without an explicit product decision.
