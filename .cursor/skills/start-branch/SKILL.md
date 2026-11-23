---
name: start-branch
description: >-
  Start new work in Crow Detector Server: update main from origin, cut a new
  branch (from the given name, or one derived from the request), load full
  project context, then STOP and wait. Use when the user says start a branch,
  new branch, check out a branch for X, or start work on X.
---

# Start Branch

This skill does three things and then **stops**:

1. Cut a new branch from an up-to-date `main`.
2. Load full context with the `load-context` skill.
3. Confirm, and wait for the user.

> ## ⛔ HARD STOP — READ THIS BEFORE YOU BEGIN
>
> **When the branch exists and context is loaded, you are DONE. Stop completely.**
>
> - Do **NOT** start the task the branch is for, even if the user described it in the same message.
> - Do **NOT** edit, create, or delete any file.
> - Do **NOT** run lint, tests, builds, installs, or any other gate.
> - Do **NOT** commit, push, or open a PR.
> - Do **NOT** write a plan, suggest next steps, or ask "should I start on X?".
> - Do **NOT** "just quickly" fix something you noticed while reading.
>
> The user's description of the work is **only** for naming the branch. The user will give instructions in their next message. Starting work early is the most common way this skill fails. **Stopping is the correct and complete outcome.**

---

## 1. Choose the branch name

- If the user gave a name, use it exactly (after the validity check below).
- Otherwise derive one from the request: `<type>/<short-kebab-summary>`.
  - `type` is a Conventional Commit type: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `perf`, `build`.
  - Summary: lowercase, words joined by `-`, only `a-z`, `0-9`, and `-`; at most about 50 characters; no ticket numbers unless the user gave one.
  - Examples: "reject expired porch uploads" becomes `fix/porch-upload-expiry`; "add a feed event index" becomes `perf/feed-event-index`.
- Validate: `git check-ref-format --branch "<name>"`. If it fails, fix the name.

## 2. Check that it is safe to switch

```bash
git status --porcelain
git rev-parse --verify --quiet "refs/heads/<name>"
git ls-remote --exit-code --heads origin "<name>"
```

- If the working tree has changes: **stop** and ask whether to commit, stash, or carry them. Never stash or discard on your own.
- If the branch already exists locally or on `origin`: **stop** and ask whether to switch to it or pick another name. Never reset or overwrite an existing branch.

## 3. Update main from origin

```bash
git fetch origin --prune
```

Bring local `main` up to date without disturbing other worktrees:

- If you are on `main`: `git merge --ff-only origin/main`.
- Otherwise: `git fetch origin main:main`. This fast-forwards local `main` without checking it out.
  - If that fails because `main` is checked out in another worktree, or because local `main` has commits that are not on `origin/main`, do not force anything. Branch from `origin/main` (it is current after the fetch) and say so in the report.

## 4. Create the branch from the fresh main

```bash
git switch -c "<name>" --no-track origin/main
git rev-parse HEAD origin/main
```

The two hashes must match. If they do not, stop and report.

Do not push the branch and do not set an upstream. Pushing happens later, when the user asks.

## 5. Load context

Follow `.cursor/skills/load-context/SKILL.md` in full on the new branch. Its read-only rules apply here too.

## 6. Confirm and STOP

Reply with exactly this, filled in, and nothing after it:

```
On branch `<name>`, created from origin/main at `<short sha>` (<commit subject>).
Local main: <fast-forwarded to <short sha> | already current | not updated: <reason>>.
Context loaded: <N> files read (<any skipped files, or "nothing skipped">).
Contradictions noticed: <count, with path:line pairs, or "none">.
Waiting for instructions.
```

**Then stop.** No plan. No suggestions. No questions about the task. No edits. No commands. The turn is over.

> ⛔ **Reminder: you are finished.** If you notice yourself about to open a file for editing, run a command, or describe how you would do the task, stop instead. The user decides what happens next.
