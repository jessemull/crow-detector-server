# PR hygiene (PR)

**Review kinds:** pr
**Applies when:** PR reviews only. Not part of a repo review.
**Policy:** `docs/CONTRIBUTING.md`, `docs/GOVERNANCE.md`.

## How to review

Hygiene is about whether the change is the change it claims to be, and whether the approvals the governance doc requires are present. It is not a substitute for reading the code.

## Criteria

- **PR-01** (SHOULD) The description matches the diff. Behavior the diff adds is mentioned; behavior it does not add is not claimed. Verify: compare the body with `git diff <base>...HEAD --stat`.
- **PR-02** (SHOULD) The diff is one logical change. Unrelated refactors are called out. Verify: group files by purpose.
- **PR-03** (SHOULD) Generated and vendored files (`package-lock.json`, `lambda/package-lock.json`, `certs/*.pem`) change only when intended. Verify: read the diff stat.
- **PR-04** (NICE) Binary and image additions are small enough to justify. Verify: `git diff --stat` sizes.
- **PR-05** (MUST) Changes that `docs/GOVERNANCE.md` marks for human review (new dependencies, workflows, CloudFormation, IAM, auth, breaking `api.yaml` or S3 layout, coverage thresholds, governance docs) say so in the PR and are not described as ready to merge by an agent alone. Verify: read the diff paths and the PR body.
- **PR-06** (SHOULD) Deletions and renames are reviewed as code, not as an empty file. Verify: the ledger rows for `D` and `R`.
- **PR-07** (SHOULD) The PR names how it was tested, including which of root, lambda, and porch suites ran. Verify: read the testing section.

## Automatic-fail signals

- A governance-required change with no note that a human must review it.
