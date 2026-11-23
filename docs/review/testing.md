# Test quality (TEST)

**Review kinds:** pr, repo
**Applies when:** always. A change with no test diff still needs this area: would the existing tests fail if the new behavior broke?
**Policy:** `docs/TESTING.md`, `CONTEXT.md` (80%).

## How to review

Coverage says a line ran. For each changed branch, name the test that fails if the branch is flipped. Then read changed tests as code: what they set up, what they assert, and whether the mock matches the real client.

## Criteria

- **TEST-01** (MUST) Every changed behavior has a test that fails if the behavior breaks. Auth, status transitions, and config fail-fast are not exempt. Verify: name the mutation and the test, or record the gap.
- **TEST-02** (MUST) No test is deleted, skipped, or weakened (assertion removed, matcher broadened) without a stated reason. Verify: read every removed test line.
- **TEST-03** (MUST) Assertions check the outcome the name claims: the status written, the exception type, the key passed to S3, the signed string. `toBeDefined` on a result that is always defined does not count. Verify: read each new assertion.
- **TEST-04** (SHOULD) Mocks match the real SDK or repository methods they replace, and they are restored. A mock of a method that does not exist is a finding. Verify: compare with the installed types.
- **TEST-05** (SHOULD) Time and env are controlled. Tests that set `process.env.NODE_ENV` restore it. Assigning `undefined` stores the string `"undefined"`; delete the key instead. Verify: search `process.env` and `Date` in changed tests.
- **TEST-06** (SHOULD) Error paths are tested: missing key, bad signature, expired timestamp, AWS error, malformed model output, empty S3 body. Verify: compare cases to the branches.
- **TEST-07** (SHOULD) Changed files outside the coverage include (`*.dto.ts`, `*.entity.ts`, `main.ts`, `scripts/`, `pi/`, workflows, CloudFormation) have a manual check or a unit test recorded. Verify: list them.
- **TEST-08** (MUST) Coverage thresholds stay at 80% in both Jest configs. A new exclusion needs a reason. Verify: read the diff of both `jest.config.js` files.
- **TEST-09** (SHOULD) Lambda tests and porch tests run when those trees change. Root Jest does not collect `lambda/` or `pi/`. Verify: the test gate output.
- **TEST-10** (NICE) e2e covers the pipe and a guarded route when bootstrap changes. Verify: read `test/app.e2e-spec.ts`.

## Automatic-fail signals

- A behavior change with no test that would fail if it broke.
- A test weakened to get green.
- A lowered coverage threshold.
