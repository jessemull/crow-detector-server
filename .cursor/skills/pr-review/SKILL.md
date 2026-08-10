---
name: pr-review
description: >-
  Review pull requests for Crow Detector Server: diff-first, code-only,
  fixed-section task lists. Use when reviewing a PR/branch, triaging review
  feedback, or deciding merge blockers.
---

# PR Review

**Severity definitions:** `docs/REVIEW.md`

**Governance:** skim `CONTEXT.md` + `AGENTS.md`; load other docs only when the diff touches that domain.

---

## What PR review is (and is not)

**Review:** code, tests, and architecture **in the diff**.

**Not review:** PR description quality, commit message format, template checklists, or backlog work unrelated to this branch (unless this PR newly violates them).

---

## Principles

1. **Diff-first** — read the change before generic checklists.
2. **Risk-scoped depth** — lite for tiny PRs; deep for auth/infra/security.
3. **Actionable findings** — MUST / SHOULD / NICE TO HAVE.
4. **No invented issues** for intentional design already documented.

---

## Output

```markdown
## Summary
...

## MUST
- [ ] ...

## SHOULD
- [ ] ...

## NICE TO HAVE
- [ ] ...

## Verdict
**Ready** | **Needs work**
```
