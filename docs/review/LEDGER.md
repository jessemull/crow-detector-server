# Review ledger

> **AI agents — read this file when:** running `pr-review` or `repo-review`, or fixing a ledger the checker rejected.

The ledger is the record of a review: every in-scope file, every criterion, every gate, and every finding, each with a status and evidence. It lives in `.review/<name>/ledger.json` (gitignored) so it survives context compaction and can be checked by a script. The report in chat is written from the ledger, never the other way around.

---

## Commands

```bash
# Create the ledger skeleton (PR review: changed files vs base)
node scripts/review/inventory.js --kind pr --base origin/main --init .review/<name>/ledger.json

# Include uncommitted and untracked changes in a PR review
node scripts/review/inventory.js --kind pr --base origin/main --worktree --init .review/<name>/ledger.json

# Create the ledger skeleton (repo review: every tracked file)
node scripts/review/inventory.js --kind repo --init .review/<name>/ledger.json

# Print the inventory and chunk plan without writing anything
node scripts/review/inventory.js --kind pr --base origin/main

# Check the ledger (exit 0 = complete and consistent)
node scripts/review/check-ledger.js .review/<name>/ledger.json
```

`npm run review:inventory -- …` and `npm run review:check -- …` are the same commands.

`inventory.js` fills every row with status `pending`. The checker rejects any `pending` row, so a review cannot be reported as finished until every row has been decided.

---

## Shape

```json
{
  "version": 1,
  "kind": "pr",
  "base": "origin/main",
  "baseSha": "<merge-base sha>",
  "head": "<HEAD sha>",
  "worktree": false,
  "createdAt": "<ISO time>",
  "files": [],
  "criteria": [],
  "gates": [],
  "findings": [],
  "verification": {
    "verifierRan": false,
    "findingsChecked": 0,
    "passesSampled": 0,
    "notes": ""
  },
  "verdict": "pending"
}
```

### `files[]`

| Field                  | Set by    | Meaning                                                                                             |
| ---------------------- | --------- | --------------------------------------------------------------------------------------------------- |
| `path`                 | inventory | Path in the reviewed tree (for deletions, the deleted path)                                         |
| `change`               | inventory | `A`, `M`, `D`, `R`, `C`, `T`, `U` (PR) or `tracked` (repo)                                          |
| `oldPath`              | inventory | Old path for renames and copies; read it too                                                        |
| `category`             | inventory | `source`, `test`, `script`, `config`, `workflow`, `infra`, `doc`, `lockfile`, `generated`, `binary`. `source` includes `src/`, `lambda/src/`, `pi/*.py`, `Dockerfile`, and `api.yaml`; `infra` includes both `cloudformation/` trees; `test` includes `*.spec.ts`, `*.test.ts`, `pi/test_*.py`, and `test/`; `generated` includes `certs/` and `*.pem` |
| `lineCount`            | inventory | Lines in the version under review (the base version for deletions)                                  |
| `lineCoverageRequired` | inventory | `false` only for `binary`, `lockfile`, `generated`                                                  |
| `chunks`               | inventory | Suggested `[start, end]` ranges of at most 150 lines                                                |
| `status`               | reviewer  | `reviewed` or `not-inspected`                                                                       |
| `linesRead`            | reviewer  | `[start, end]` ranges actually read; must cover `1..lineCount` when `lineCoverageRequired`          |
| `evidence`             | reviewer  | What was checked in this file (callers searched, tests read, criteria applied)                      |
| `reason`               | reviewer  | Required for `not-inspected`                                                                        |

For a deleted file, read the base version (`git show <baseSha>:<path>`) and record those ranges. For a rename, record the new file's ranges and note in `evidence` that the old side was compared.

### `criteria[]`

| Field                    | Set by    | Meaning                                                                            |
| ------------------------ | --------- | ---------------------------------------------------------------------------------- |
| `id`, `area`, `severity` | inventory | From `docs/review/*.md`                                                            |
| `status`                 | reviewer  | `pass`, `finding`, `not-applicable`, `not-inspected`                               |
| `evidence`               | reviewer  | Required for `pass` and `finding`. Must cite a `path:line` or a backticked command |
| `reason`                 | reviewer  | Required for `not-applicable` and `not-inspected`                                  |
| `findings`               | reviewer  | Finding IDs; required (non-empty) for `finding`                                    |

### `gates[]`

Required gates: `hooks`, `lint`, `typecheck`, `format`, `test`, `build`, `security`. Each one covers the root package and `lambda/` (and porch tests, for `test`). Optional: `e2e`.

| Field             | Meaning                                                                 |
| ----------------- | ----------------------------------------------------------------------- |
| `name`, `command` | Gate and the command to run                                             |
| `status`          | `passed`, `failed`, `not-run`                                           |
| `exitCode`        | Integer exit code; required for `passed` and `failed`                   |
| `evidence`        | Key output lines (for example the coverage summary); for `not-run`, why |

### `findings[]`

| Field          | Meaning                                                                          |
| -------------- | -------------------------------------------------------------------------------- |
| `id`           | `F-1`, `F-2`, …                                                                  |
| `severity`     | `MUST`, `SHOULD`, `NICE`, `VERIFY`, `OUT OF SCOPE`                               |
| `confidence`   | 0–1. Below 0.7 requires `VERIFY`                                                 |
| `location`     | `path:line` or `path:start-end`                                                  |
| `criteria`     | Criterion IDs violated; each must list this finding back                         |
| `title`        | Imperative, one line                                                             |
| `detail`       | The failing scenario and why it matters                                          |
| `evidence`     | Lines read, commands run, callers found                                          |
| `verification` | `verified` (fresh-context verifier confirmed) or `unverified` (must be `VERIFY`) |
| `preExisting`  | `true` when the issue exists before the change                                   |

### `verification`

Set `verifierRan: true` only after the fresh-context verifier has re-checked every finding and sampled `pass` rows. Record counts and anything the verifier overturned in `notes`.

### `verdict`

`approve`, `approve-with-should`, `changes-required`, or `incomplete`, following the rules in `docs/REVIEW.md`.

---

## What the checker enforces

- The ledger's `head` matches the current `HEAD`, and its file list matches a fresh inventory (no missing or extra files).
- Every criterion in `docs/review/*.md` for this review kind is present exactly once.
- No `pending` rows anywhere; statuses are valid.
- `reviewed` files cover every line when coverage is required.
- `pass` and `finding` rows cite evidence; `not-applicable` and `not-inspected` rows give reasons.
- Findings have valid severity, confidence, location, criteria links in both directions, and evidence; unverified or low-confidence findings are `VERIFY`.
- Required gates are present with exit codes.
- The verdict is allowed by the rows (for example any `not-inspected` row or `not-run` gate forces `incomplete`).

The checker proves the ledger is complete and consistent. It cannot prove the reviewer read carefully; the fresh-context verifier and the evals in `evals/review/` cover that.
