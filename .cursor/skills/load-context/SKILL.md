---
name: load-context
description: >-
  Load end-to-end context for Crow Detector Server before any work: every
  governance and domain doc, the rules, the skills, the configs, the
  workflows, the infrastructure, both packages, and the porch recorder, then
  report what was read and any doc/code contradictions. Use at the start of a
  session, before a review, or when the user says load context or get up to
  speed.
---

# Load Context

Read the whole project before working on it. Agents that skip context make avoidable mistakes: they import across the `lambda/` boundary, add a route with no guard, contradict `docs/DEVICES.md`, or edit a stack that prod and dev share. This skill is read-only. It changes no files and runs no gates.

## Rules

- Read files **in full** with the Read tool. Do not skim, sample, or rely on search snippets, file names, or memory of a previous session.
- Read in the order below. Higher items set the rules for lower ones (`CONTEXT.md` precedence).
- Keep a running list of every file read. If a file is too long to read in one call, read it in ranges until the end.
- Note any place a doc and the code disagree, or two docs disagree. Do not fix it; report it.
- Do not start the task, edit, commit, or run anything beyond the read-only commands listed here. When done, report and wait.

## 1. Governance (mandatory, in order)

1. `CONTEXT.md`
2. `AGENTS.md`
3. `docs/GOVERNANCE.md`
4. `docs/ARCHITECTURE.md`
5. `docs/TESTING.md`
6. `docs/COMMENTS.md`
7. `docs/SECURITY.md`
8. `docs/ENVIRONMENT.md`
9. `docs/CONTRIBUTING.md`
10. `docs/REVIEW.md`

## 2. Domain docs

`docs/DEVICES.md`, then every other `docs/*.md` not read yet (`ls docs`), including `docs/review/`.

## 3. Review system

`docs/REVIEW.md`, `docs/review/LEDGER.md`, `docs/review/REPORT_TEMPLATE.md`. For the criteria files, read each file's header and criterion IDs (`rg -n '^- \*\*' docs/review/`); read a criteria file in full when the task touches its area.

## 4. Agent tooling

- Every rule in `.cursor/rules/`, in full.
- The `name` and `description` of every skill in `.cursor/skills/*/SKILL.md`. Read a skill in full only when you use it.
- `CLAUDE.md`, `GEMINI.md`, and `README.md`.

## 5. Configuration and tooling

Root `package.json` (scripts, engines, overrides, dependencies), `lambda/package.json`, `Makefile`, `.nvmrc`, `tsconfig.json`, `tsconfig.build.json`, `nest-cli.json`, `eslint.config.mjs`, `lambda/eslint.config.mjs`, `jest.config.js`, `lambda/jest.config.js`, `commitlint.config.js`, `.prettierrc`, `.gitignore`, `.dockerignore`, `.env.example`, `pi/porch.env.example`, and every file in `.husky/` (not `.husky/_/`).

Do not read the lockfiles line by line. Record the installed versions with `npm ls @nestjs/core typeorm @anthropic-ai/sdk @aws-sdk/client-s3 --depth=0`.

## 6. Delivery and infrastructure

- Every workflow in `.github/workflows/`, plus `dependabot.yml`, `CODEOWNERS`, and the PR template.
- Every template in `cloudformation/` and `lambda/cloudformation/`.
- `Dockerfile`.
- `scripts/` (every file; test files may be skimmed for structure).
- `pi/` (the recorder, its library, and its tests).

## 7. Application source

Every file under `src/`, tests included, in this order: `src/main.ts`, `src/app.module.ts`, `src/config/`, `src/auth/`, `src/common/`, `src/health/`, `src/feed/`, `src/detection/`, `src/urls/`, `src/porch/`. Then `api.yaml`. Then `lambda/src/`.

For framework behavior, read the installed docs or types under `node_modules/` (`@nestjs`, `typeorm`, `@aws-sdk`, `@anthropic-ai/sdk`, `fastify`) instead of relying on memory.

## 8. Repository state

```bash
git status --short --branch
git log --oneline -10
git config core.hooksPath
node -v
```

## Report

Reply with exactly these sections, then stop and wait:

1. **Read** — counts per group above, and any file you could not read, with the reason. If you skipped anything, say so; do not claim full context.
2. **Project summary** — what the service does, the modules, how a device upload reaches the database, how the porch recorder works, how auth works, and the quality gates.
3. **Repository state** — branch, ahead or behind, uncommitted changes, whether hooks are installed, and the Node version against `.nvmrc`.
4. **Contradictions noticed** — doc versus code or doc versus doc, with `path:line` on both sides. Write `(none noticed)` if there are none.
5. **Ready** — one line: "Context loaded. Waiting for instructions."

Do not propose work, start fixing contradictions, or run gates unless the user asks.
