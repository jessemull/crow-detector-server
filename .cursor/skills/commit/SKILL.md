---
name: commit
description: >-
  Prepare and create commits for Crow Detector Server following Conventional
  Commits, governance rules, and quality gates. Use when staging, committing,
  or preparing changes for PR.
---

# Commit Changes

Read before committing:

- `CONTEXT.md`
- `AGENTS.md`
- `docs/GOVERNANCE.md`
- `docs/ARCHITECTURE.md`
- `docs/REVIEW.md`
- `docs/TESTING.md`

Safety rules:

- Only commit when the user explicitly requests it.
- Never use `--no-verify` unless the user explicitly requests it.
- Never amend commits that have been pushed to remote.
- Never force-push to `main`/`master`.

Commits must remain atomic, intentional, reproducible, reviewable, and semantically meaningful.

---

# Conventional Commit Format

```text
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `style`, `perf`, `chore`, `build`, `ci`, `revert`

Scopes (commitlint): `auth`, `feed`, `detection`, `urls`, `health`, `common`, `config`, `lambda`, `ci`, `docs`, `deps`, `infra`, `docker`

Prefer `make commit` (Commitizen) for interactive commits.

---

# Workflow

1. `git status` / `git diff` / `git log -5 --oneline`
2. Stage intentional files only (never `.env` secrets)
3. Draft message focusing on **why**
4. Commit via HEREDOC or Commitizen
5. `git status` to verify
