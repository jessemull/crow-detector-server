---
name: repo-review
description: >-
  Full-repository audit for Crow Detector Server with fixed output sections and
  Ready/Needs work verdict. Use for release readiness or broad health checks —
  not for single-PR review (use pr-review).
---

# Repo Review

Diff-agnostic full audit. For PR diffs, use `pr-review` instead.

Read: `CONTEXT.md`, `AGENTS.md`, `docs/GOVERNANCE.md`, `docs/ARCHITECTURE.md`, `docs/REVIEW.md`, `docs/TESTING.md`, `docs/SECURITY.md`.

---

## Process

1. Survey structure (`src/`, `lambda/`, `cloudformation/`, `.github/`, `docs/`, `.cursor/`)
2. Spot-check Nest module boundaries and Lambda isolation
3. Spot-check tests and coverage config (80%)
4. Spot-check security (secrets, ECDSA, IAM snippets, logging)
5. Spot-check governance freshness (CONTEXT/AGENTS/docs consistency)
6. Run `make preflight` when practical; record results
7. Do **not** invent issues for intentional design (Rekognition `*`, public IP if required)

---

## Output format

```markdown
## Repo summary

<2–3 sentences + overall risk>

## Areas reviewed

Architecture · Testing · Security · CI · Docs · Tooling

## Strengths

- ...

## Findings

### MUST
- ...

### SHOULD
- ...

### NICE TO HAVE
- ...

## Preflight

<pass/fail + notes>

## Verdict

**Ready** | **Needs work**
```

Ready requires an empty MUST list.
