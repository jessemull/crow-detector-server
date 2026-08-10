# PR Review Framework

> **Precedence:** CONTEXT.md > GOVERNANCE.md > ARCHITECTURE.md > **REVIEW.md** > inline comments.
>
> **AI agents — read this file when:** reviewing a PR, writing review comments, triaging review feedback, or deciding whether an issue is blocking.

---

## Severity tiers

### MUST (blocking)

The PR **cannot merge** until these are resolved.

- Architecture violations (wrong Nest layering, Lambda importing Nest sources, duplicate providers instead of exports)
- Security issues (hardcoded secrets, secrets/API key prefixes in logs, prod ECDSA bypass)
- Crash-inducing bugs / unhandled failures in critical paths
- Data loss or corrupt API / S3 contracts
- Governance violations (breaking non-negotiable constraints)
- Type safety violations (`any` misuse)
- New behavior without tests
- Coverage threshold regressions

### SHOULD (significant)

Fix in this branch before merge (same actionability as MUST for agents using `pr-review`).

- Performance regressions (N+1 queries, unbounded image buffers)
- Testing gaps (missing edge cases on touched logic)
- Weak error logging / missing context
- Missing env documentation for new variables
- Soft-vs-blocking audit/doc drift
- CFN env mismatches (prod importing `*-dev-*` exports)

### NICE TO HAVE (non-blocking)

- Naming improvements
- Minor style beyond linters
- Small readability refactors in touched files
- OIDC for GitHub→AWS (tracked follow-up)

---

## PR hygiene review

- [ ] PR description follows the template
- [ ] Focused on a single logical change
- [ ] Conventional Commits
- [ ] No unrelated bundled changes
- [ ] Size appropriate (< 400 lines preferred; large PRs justified)

---

## Architecture review checklist

- [ ] Controllers thin; logic in services
- [ ] Shared Nest providers exported (not duplicated)
- [ ] No Nest ↔ Lambda source imports
- [ ] Config via typed Nest config helpers
- [ ] CloudFormation uses `aws-infra-*` ImportValues
- [ ] Env-specific CFN imports match `Environment`

---

## TypeScript review

- [ ] Strict typing; no unjustified `any`
- [ ] Explicit types on public APIs where practical
- [ ] No empty catch blocks
- [ ] Comment policy followed (`docs/COMMENTS.md`)

---

## AWS / security review

- [ ] No secrets in logs
- [ ] ECDSA prod bypass impossible
- [ ] IAM least privilege preserved (Rekognition `*` only if required)
- [ ] Env vars documented in `docs/ENVIRONMENT.md` + `.env.example`
- [ ] No breaking OpenAPI/DTO/S3 layout without coordination

---

## Testing review

- [ ] Co-located specs/tests for changed logic
- [ ] External I/O mocked
- [ ] Coverage thresholds still met
- [ ] No flaky time/network assumptions

---

## Verdict language

Use: **Ready** | **Needs work**

- **Ready** — empty MUST list (SHOULD may remain as tracked follow-ups if explicitly accepted)
- **Needs work** — one or more MUST items remain
