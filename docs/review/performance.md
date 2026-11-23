# Performance (PERF)

**Review kinds:** pr, repo
**Applies when:** any query, image pipeline, list endpoint, or Lambda packaging change is in scope, and on every repo review.
**Policy:** `AGENTS.md` (Performance).

## How to review

Look for work that scales with the number of events or the size of an image. A query or a buffer that grows without a bound is the finding, even when today's data is small.

## Criteria

- **PERF-01** (SHOULD) No N+1 queries. Related data is loaded in one query. Verify: count repository calls inside loops.
- **PERF-02** (SHOULD) List endpoints and background scans have a limit and a supporting index. Verify: read `take` and the entity indexes.
- **PERF-03** (SHOULD) Images are resized before they are sent to Claude or Rekognition, and the original is not held in memory alongside every derivative. Verify: read the sharp pipeline.
- **PERF-04** (SHOULD) The Lambda bundle does not pull in the Nest app, the AWS SDK v2, or unused clients. Verify: read `lambda/webpack.config.js` externals and the import graph.
- **PERF-05** (NICE) Hot paths do not log full bodies at `info`. Verify: read the log statements on the request path.
- **PERF-06** (SHOULD) Presigned URL generation is not done in a loop for an unbounded list. The porch list has a cap. Verify: read the list method.

## Automatic-fail signals

- An unbounded `find` on a table that grows with every device event.
- A full-resolution image sent to the model on every request with no size cap.
