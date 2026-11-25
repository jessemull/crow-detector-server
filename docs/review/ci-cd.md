# Workflows, deploy, and rollback (CI)

**Review kinds:** pr, repo
**Applies when:** any file under `.github/` is in scope, and on every repo review.
**Policy:** `docs/GOVERNANCE.md` (CI changes need human review). **References:** GitHub Actions secure use, script injections, OIDC with AWS.

## How to review

Read every changed workflow in full, not just the hunk. Untrusted values are `github.head_ref`, PR titles, commit messages, and workflow `inputs`. Those must not be interpolated into `run:`. Then walk a failed deploy: what is left running, and does rollback restore the previous image or task definition.

## Criteria

- **CI-01** (MUST) No untrusted value is interpolated into `run:`. It is passed through `env:` and referenced as a shell variable. Verify: search `${{` inside `run:` blocks.
- **CI-02** (SHOULD) Every job sets `permissions:` to what it uses, and deploy jobs set `timeout-minutes` and `concurrency`. Verify: read the top of each job.
- **CI-03** (SHOULD) Third-party actions are pinned to a commit SHA. First-party `actions/*` tags are called out, not silently accepted as equivalent. Verify: list `uses:` lines.
- **CI-04** (SHOULD) AWS credentials come from OIDC role assumption. A new long-lived key is a MUST. Verify: read the credentials step.
- **CI-05** (MUST) A secret expression cannot fall through to the wrong environment (`inputs.environment == 'dev' && secrets.A || secrets.B` uses B whenever A is empty). Verify: read each `secrets.` expression.
- **CI-06** (MUST) The image tag that is deployed is the tag that was built, and it is not `latest` alone. Rollback deploys a previously recorded tag, and an empty input does not deploy or delete. Verify: trace the tag from build to `docker push` to the task definition.
- **CI-07** (MUST) PR workflows run the same gates as `make preflight` for the files they claim to cover: root lint, format, test, porch tests, build, and audit; lambda lint, test, format, and audit. A workflow that skips one of these needs a stated reason. Verify: compare the steps with the Makefile.
- **CI-08** (SHOULD) `npm ci` is used, caches are keyed by the lockfile, and the Node version matches `.nvmrc` (root) or 24 (lambda). Verify: read `setup-node`.
- **CI-09** (SHOULD) `pull_request_target` is not used. Verify: read the `on:` keys.
- **CI-10** (MUST) A failed deploy step does not continue into a traffic shift, and rollback is triggered by a failed rollout rather than only by a later smoke test. Verify: read `if:` conditions on deploy and rollback jobs.

## Automatic-fail signals

- `${{ github.head_ref }}` or an input interpolated into `run:`.
- A rollback that can deploy an empty tag or delete resources.
- PR CI that no longer runs tests for the package the change is in.
