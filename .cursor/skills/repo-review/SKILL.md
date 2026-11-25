---
name: repo-review
description: >-
  Exhaustive whole-repository audit for Crow Detector Server: every tracked
  file read line by line, every criterion in docs/review/ decided with
  evidence, gates, a doc-drift pass, a fresh-context verifier, a checked
  ledger, and a remediation backlog. Use for release readiness or "review the
  repo".
---

# Repository Review

Same standard, ledger, and report as `pr-review` (`docs/REVIEW.md`, `docs/review/`), applied to **every tracked file** instead of a diff. Read the `pr-review` skill first; this skill lists only what differs. Every rule there applies: whole files, one row per criterion, evidence for every pass, VERIFY for anything unproven, the fresh-context verifier, and `check-ledger` exiting 0 before the report.

The repository is about 200 tracked files. Most of the bulk is `package-lock.json` files and the RDS CA bundle, which need a row but not line coverage. That is still too much for one context window, so the work is partitioned and the ledger carries state. Do not shrink the scope to fit; add partitions.

Do not fix anything during the review. Fixes come afterwards, as separate PRs from the backlog.

---

## Phase 0 — Context

Run the `load-context` skill in full. A repo review that has not read every governance and domain doc cannot judge drift.

## Phase 1 — Inventory and ledger

```bash
git fetch origin
git status --short   # a repo review reads files as they are on disk; commit or stash first
npm run review:inventory -- --kind repo --init .review/repo-<short head sha>/ledger.json
```

Resume an existing ledger instead of starting over.

## Phase 2 — Gates

All required gates from `pr-review` Phase 2, plus `npm run test:e2e` when the environment allows (record `not-run` with the reason otherwise). For commitlint, check the current branch against `origin/main` and report older failures as pre-existing.

## Phase 3 — Partitioned line-by-line reading

Split `files[]` into partitions of roughly 1,500–2,500 lines of required coverage, keeping related files together:

1. `src/auth/`, `src/config/`, `src/common/`, `src/health/`, `src/main.ts`, `src/app.module.ts`, and their tests
2. `src/feed/` and `src/detection/`
3. `src/urls/` and `src/porch/`
4. `lambda/src/`
5. `pi/`, `scripts/`, `.husky/`
6. `.github/`, `cloudformation/`, `lambda/cloudformation/`, `Dockerfile`
7. `docs/`, `.cursor/`, `CONTEXT.md`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `README.md`, `api.yaml`, root config, `evals/`

Run one subagent per partition in parallel. Each reads every line of its files, applies **every** criteria file, and returns per-file `linesRead` and evidence, per-criterion observations, and candidate findings in the JSON shape from `pr-review` Phase 5. A criterion is decided for the whole repo: a `pass` cites evidence from every partition where it applies, and any partition's finding makes the row a `finding`.

Record each file as its partition finishes. Lockfiles, the CA bundle, and generated files still get a row (DEP-01, PR-03).

## Phase 4 — Area passes across the whole repo

Run the area groups from `pr-review` Phase 5 again, this time across the whole repository, so cross-file problems surface: the signed string differing between the guard and a signer, a DTO field missing from `api.yaml`, a prefix the Lambda handles but the bucket lifecycle does not, an env var documented in one place.

## Phase 5 — Cross-cutting passes

Everything in `pr-review` Phase 6, applied repo-wide, plus:

1. **Doc drift.** Check every factual claim in `CONTEXT.md`, `AGENTS.md`, `docs/*.md`, `.cursor/rules/`, and `.cursor/skills/` against the code: commands, paths, env vars, versions, scopes, workflow behavior. Each false claim is a DOC-02 or DOC-03 finding with `path:line` on both sides.
2. **Template versus live.** Infrastructure behavior that cannot be confirmed from the repo (deployed stack parameters, live bucket policies, the running task definition) is VERIFY with the exact command that would prove it.
3. **Dead code and config.** Unused exports, providers, scripts, and dependencies (ARCH-07, CFG-10, DEP-11).
4. **Both packages.** A setting changed in the root and not in `lambda/`, or the reverse, is a finding unless the difference is intentional (CON-06, CFG-09).

## Phase 6 — Findings, verifier, check

Phases 7–9 of `pr-review`, unchanged. Every finding in a repo review is effectively pre-existing; set `preExisting: true`, and remember that any MUST forces `changes-required`.

Sample at least 20% of `pass` rows for the verifier, MUST criteria first.

## Phase 7 — Report and backlog

Write the report with `docs/review/REPORT_TEMPLATE.md`. `approve` means ready; `changes-required` means needs work.

Then add a **Remediation backlog**: group findings into proposed fix PRs, each with a Conventional branch name, the finding IDs it closes, the files it touches, the tests it needs, and its risk. Order MUST groups first, then by blast radius: authentication and data integrity, then infrastructure and CI, then correctness, then the rest. Keep each PR small enough to review in one sitting.

## Measuring this skill

There is no checked-in repo recall set. When a review misses a real defect, record it so the next recall set can be rebuilt. See `evals/review/README.md`.
