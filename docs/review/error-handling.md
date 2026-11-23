# Errors and failure modes (ERR)

**Review kinds:** pr, repo
**Applies when:** any code that can fail is in scope: database calls, AWS calls, model calls, HTTP calls, parsing, env reads, file and process operations, workflows.
**Policy:** `AGENTS.md` (Error Handling), `docs/SECURITY.md`. **References:** OWASP Top 10:2025 A10 Mishandling of Exceptional Conditions.

## How to review

List every operation in scope that can fail. For each, answer: what fails, who notices, what status is returned, what is logged, and what state is left behind. Failing open is the failure mode to look for first. Look for empty `catch` blocks, `catch` blocks that only log, fallbacks that make a broken configuration look like success, and CI steps that mask exit codes.

## Criteria

- **ERR-01** (MUST) Required configuration fails closed. Missing database settings, the Claude key, or a device public key prevent startup or reject the request outside development, and never fall back to a dummy key or a skipped check. Verify: read each config read and the branch that handles it missing.
- **ERR-02** (MUST) No swallowed errors. Every `catch` handles, reports, or rethrows, and an intentional swallow has a comment saying why. Verify: search `catch` in scope and read each block.
- **ERR-03** (MUST) Domain failures map to the right HTTP exception. A bad signature is 401, a missing resource is 404, a conflict is 409, and a validation failure is 400. A 200 that hides a failure is a defect. Verify: read each thrown exception and each returned status.
- **ERR-04** (SHOULD) Error responses and logs do not leak internals: SQL, stack traces, key material, signed URLs, or upstream response bodies. Verify: read every message string and logged object.
- **ERR-05** (MUST) Partial failure leaves a consistent state. A multi-step write (database row plus S3 object, status update plus side effect) either completes or records a status that can be retried without doubling the side effect. Verify: walk each step failing in turn.
- **ERR-06** (SHOULD) Retries are bounded and back off, and a retry cannot loop on a permanent error. Verify: find each retry and its exit condition.
- **ERR-07** (SHOULD) Promise rejections are handled, including fire-and-forget work and top-level script entry points. Verify: find each `async` call site and its error path.
- **ERR-08** (SHOULD) Exit codes are honest. Scripts exit non-zero on failure, and CI steps do not mask failures with `|| true`, `continue-on-error`, or ignored pipelines without a documented reason. Verify: search those patterns in scope.
- **ERR-09** (SHOULD) Upstream failures are distinguishable in logs: database, S3, Rekognition, and Claude failures each say which dependency failed and which event they belong to. Verify: read the log fields.

## Automatic-fail signals

- A fail-open path in authentication, config loading, or a deploy step.
- A `catch` that discards the error with no comment, report, or status change.
- A side effect that can run twice when a later step fails and the caller retries.
