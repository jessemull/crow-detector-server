---
name: pr-review
description: >-
  Exhaustive PR or branch review for Crow Detector Server: gates, a ledger of
  every file, line, and criterion in docs/review/, parallel per-area passes,
  cross-cutting checks, a fresh-context verifier, and a checked report. Use
  when the user asks to review a PR, a branch, or local changes.
---

# PR Review

The standard is `docs/REVIEW.md`; the criteria are `docs/review/*.md`; the record is the ledger (`docs/review/LEDGER.md`); the output is `docs/review/REPORT_TEMPLATE.md`. This skill is the procedure. Follow every phase in order. The review is finished only when `check-ledger` exits 0 and the report is written from the ledger.

Thoroughness beats speed and brevity. A long, complete review is correct; a short one that skipped files or criteria is a failed review. Re-read the **Forbidden shortcuts** in `docs/REVIEW.md` before starting. In particular: read whole files, not hunks; never pass a criterion without evidence; never stop after the first findings; never drop a concern because it is unproven (make it VERIFY) or pre-existing (mark it pre-existing).

Do not edit code, commit, push, or post comments during a review unless the user asks.

---

## Phase 0 — Inputs and context

1. Settle the inputs: the **base** (default `origin/main`; for a stacked PR, its parent branch), whether to include uncommitted work (`--worktree`), and the PR description if there is one (`gh pr view --json title,body,commits` when a PR exists).
2. Load context with the `load-context` skill unless it was done in this session on this branch. At minimum, read the governance docs, `docs/REVIEW.md`, `docs/review/LEDGER.md`, `docs/review/REPORT_TEMPLATE.md`, and every criteria file in `docs/review/` in full.

## Phase 1 — Inventory and ledger

```bash
git fetch origin
npm run review:inventory -- --kind pr --base <base> [--worktree] --init .review/<name>/ledger.json
```

- `<name>` is `pr-<branch>-<short head sha>` (replace `/` with `-`).
- If the ledger already exists, **resume from it**. Do not pass `--force` unless the head changed and you are starting over.
- Read the printed inventory. Note warnings (dirty tree, hooks missing, Node mismatch); they become gate evidence.
- The ledger is the working memory of the review. Update it on disk after every file and every pass, so the review survives context compaction. If context runs low, keep going from the ledger. Never wrap up early.

## Phase 2 — Gates

Run every required gate and record `status`, `exitCode`, and key output in `evidence`. A failing gate does not stop the review; record it and continue. Each gate covers both the Nest package and `lambda/`.

| Gate      | Command                                                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| hooks     | `git config core.hooksPath` (expect `.husky/_`) and `test -d .husky/_`; then `npx --no-install commitlint --from <baseSha> --to HEAD` |
| lint      | `make lint` and `make lambda-lint` (list warnings in changed files)                                                                   |
| typecheck | `npx tsc --noEmit -p tsconfig.build.json` and `(cd lambda && npx tsc --noEmit -p tsconfig.json)`                                       |
| format    | `make format-check` and `make lambda-format-check`                                                                                    |
| test      | `make test`, `make lambda-test`, and `make porch-test` (record coverage summaries)                                                    |
| build     | `make build` and `make lambda-build`                                                                                                  |
| security  | `npm audit --audit-level=high` in the root and in `lambda/`                                                                           |

Record `node -v` in the hooks evidence (GATE-02). Run the suppression search from GATE-11. Run `npm run test:e2e` when bootstrap, the global pipe, or module wiring changed; otherwise record why it was not run.

If a gate cannot run (no network, missing credentials), set `not-run` with the reason. That forces verdict `incomplete`, which is the honest result.

## Phase 3 — Understand the change

1. `git log --oneline <baseSha>..HEAD` and `git diff --stat <baseSha>...HEAD`.
2. State in one paragraph what the change claims to do, and group the files by purpose. This is what COR-11 and PR-01 are checked against.
3. List what the change **should** have touched but did not: tests for changed behavior, docs that name changed things, and the other side of a contract. The Nest tree and `lambda/` do not share types, so a field renamed in one can leave the other compiling cleanly. Missing changes are findings.

## Phase 4 — Read every file, line by line

For **each** file in `files[]` (in inventory order; do not skip any category):

1. Read the **whole file** at the reviewed version, chunk by chunk using the ledger's `chunks`. For deletions read `git show <baseSha>:<path>`; for renames also read the old side.
2. Read its diff: `git diff <baseSha>...HEAD -- <path>` (or without `...HEAD` for `--worktree`). Read deleted lines as carefully as added ones: removed guards, checks, cleanup, and tests are the most common hidden defects.
3. For every changed export, DTO field, entity column, route, env var, S3 prefix, header, or status value: find every user with `rg -n "<symbol>"` across both packages, `pi/`, tests, workflows, and docs, and read those call sites.
4. Read the file's tests and the docs that describe it.
5. Write candidate findings as you go (see Phase 7 for fields). Do not filter yet.
6. Update the ledger row: `status: reviewed`, `linesRead` ranges actually read, and `evidence` naming what was checked. Save.

Lockfiles, the RDS CA bundle, and generated files still get a row. Check each lockfile against its `package.json` (DEP-01).

## Phase 5 — Area passes (parallel subagents)

Every criterion in `criteria[]` gets its own decision. Split the criteria files into groups and run one subagent per group **in parallel**. Suggested groups:

1. gates, pr-hygiene, conventions, docs-and-comments, architecture, configuration
2. correctness, contracts, error-handling, typescript
3. security, auth, api, database
4. llm, aws, lambda, python, docker
5. ci-cd, infrastructure, networking, concurrency, performance
6. testing, observability, dependencies

Give each subagent: the repo path, base sha, head sha, the change summary from Phase 3, the file list, the criteria files for its group, and these instructions:

> Read each assigned criteria file in full. For every criterion ID, decide `pass`, `finding`, `not-applicable`, or `not-inspected`. Read the whole files you need; do not rely on diff hunks or on this summary. A `pass` needs evidence citing `path:line` or a backticked command you ran. `not-applicable` needs a specific reason. Report every candidate finding with location, the failing scenario, evidence, a proposed severity, and a confidence. Do not stop after the first findings. Return JSON: `{ "criteria": [{ "id", "status", "evidence", "reason", "findings": [<temp ids>] }], "findings": [{ "tempId", "location", "criteria", "severity", "confidence", "title", "detail", "evidence", "preExisting" }] }`.

Merge results into the ledger: one row per criterion, findings numbered `F-1`, `F-2`, … with links in both directions. If two subagents report the same issue, merge them into one finding that lists both criteria. Where you disagree with a subagent's pass, re-check it yourself.

If subagents are unavailable, run the same groups sequentially yourself and say so in the report.

## Phase 6 — Cross-cutting passes

Do each of these explicitly and record what you checked in the relevant criterion evidence:

1. **Sibling parity** (CON-06): feed versus detection, dev versus prod workflow jobs, root versus lambda config. Diff the siblings against each other.
2. **Both sides of a contract** (CON-05): the ECDSA signed string in the guard, `lambda/src/util/auth.ts`, `pi/record_on_motion_lib.py`, and `scripts/generate-auth-token.ts`; DTO fields versus `api.yaml`; S3 prefixes across the URL service, the Lambda, and the bucket rules.
3. **Removed code**: list every deleted line that was a guard, check, cleanup, error path, assertion, or doc statement, and confirm each removal is intended and safe.
4. **Weakened tests** (TEST-02, TEST-03): compare changed tests old against new. Any loosened assertion, removed case, added skip, or broadened mock is a finding unless justified.
5. **Comments and docs** (DOC-01, DOC-02): for every changed function, re-read nearby comments and confirm they are still true. Search docs, rules, and skills for changed names.
6. **Config** (CFG-01, CFG-03): follow every env var through `src/config/`, `.env.example`, `docs/ENVIRONMENT.md`, workflows, and `pi/porch.env.example`.
7. **Pre-existing issues**: issues found in the files you read are reported with `preExisting: true`. Do not omit them.
8. **What is missing**: tests, docs, rollout notes, and approvals (PR-07, PR-08) the change needed but does not have.

## Phase 7 — Findings

Each finding in the ledger has: `id`, `severity`, `confidence`, `location`, `criteria`, `title` (imperative), `detail` (the concrete failing scenario and why it matters), `evidence`, `verification`, `preExisting`. Rules from `docs/REVIEW.md`:

- Confidence below 0.7, or not confirmed by the verifier, means severity `VERIFY`. Unproven is never dropped.
- Severity follows the definitions and examples in `docs/REVIEW.md`, not how much work the fix is.
- One finding per root cause; list every location in `detail` when the same defect appears in several places.
- Do not file a finding for an intentional AWS constraint that `docs/SECURITY.md` already documents. Rekognition `Resource: '*'` is the known case.

## Phase 8 — Fresh-context verifier

Launch **one new subagent** that has not seen your reasoning. Give it only: the repo path, base and head shas, the ledger path, and these instructions:

> You are verifying a code review. For every finding in the ledger, re-derive it from the code and commands yourself: confirm it, overturn it (say why, with evidence), or mark it unproven. Then sample at least 10 `pass` criterion rows, or 20% if there are more than 50, choosing MUST criteria first, and check each pass against the code. Finally list anything in the diff that no finding and no criterion evidence covers. Do not trust the ledger's evidence; check it. Return JSON: `{ "findings": [{ "id", "result", "evidence" }], "passes": [{ "id", "result", "evidence" }], "uncovered": [...] }`.

Apply the results:

- Confirmed: `verification: verified`.
- Unproven: `verification: unverified`, severity `VERIFY`.
- Overturned: remove the finding only when the verifier's evidence is convincing; record it in `verification.notes`.
- A pass row the verifier rejects: re-check it and change it to `finding` when the verifier is right.
- Uncovered items: review them and add rows or findings.

Set `verification.verifierRan: true`, `findingsChecked`, `passesSampled`, and `notes`.

## Phase 9 — Self-audit and check

Before the verdict, answer these in the ledger notes and fix any "no":

- Did I read every line of every file whose coverage is required, including tests, workflows, CloudFormation, Python, and deleted files?
- Does every criterion row have its own evidence or reason?
- Did I search callers for every changed symbol, in both packages?
- Did I compare the two sides of every contract the change touches?
- Did I report pre-existing issues in the files I read?
- Is anything I noticed missing from the findings?

Set the verdict using the rules in `docs/REVIEW.md`, then run:

```bash
npm run review:check -- .review/<name>/ledger.json
```

Fix every problem it reports and run it again until it exits 0. Never edit the ledger just to satisfy the checker (for example by inventing evidence or marking unread lines as read); if the work was not done, do the work or mark the row `not-inspected` with the reason.

## Phase 10 — Report

Write the report in chat following `docs/review/REPORT_TEMPLATE.md`, from the ledger. Include every finding at every severity, the gates table, everything `not-inspected`, the coverage summary from `check-ledger`, and the ledger path. Do not soften MUST or SHOULD items, and do not add findings that are not in the ledger.

Post to GitHub only when the user asks.

## Companion skills

Use for deeper passes in their areas: `security-review`, `testing`, `dependency-upgrade`. Their checks map to the criteria files; they do not replace the ledger.
