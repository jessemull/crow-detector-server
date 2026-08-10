---
name: pr-summary
description: >-
  Generate a copy-pasteable GitHub PR description from the current branch diff.
  Fills `.github/PULL_REQUEST_TEMPLATE.md`. Use when the user runs /pr-summary,
  asks for a PR body, or pull request description before opening a PR.
disable-model-invocation: true
---

# PR Summary

Produce a **filled GitHub PR description** for the current branch matching `.github/PULL_REQUEST_TEMPLATE.md` exactly.

Content guidance:

- `docs/CONTRIBUTING.md` — What / Why / How / Testing
- `docs/REVIEW.md` — inform **Review Notes**

Do not invent or omit template sections.

---

## Workflow

### 1. Gather branch context

```bash
git fetch origin main
git branch --show-current
git status --short
git log --oneline origin/main..HEAD
git diff origin/main...HEAD --stat
git diff origin/main...HEAD
```

Include uncommitted changes in analysis if the working tree is dirty, and say so.

### 2. Infer metadata and fill the template

Map commits/diff into Summary, Type checkboxes, Checklist, and Review Notes.
