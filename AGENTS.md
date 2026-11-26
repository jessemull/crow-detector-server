# AGENTS.md — Crow Detector Server

> Complete development rules and constraints for AI agents and human contributors.
> This file is the authoritative reference for all coding standards, architecture rules, and workflow requirements.

---

## Repository Overview

| Field            | Value                                           |
| ---------------- | ----------------------------------------------- |
| **Project**      | Crow Detector — interactive crow feeder backend |
| **Architecture** | NestJS modular monolith (ECS Fargate)           |
| **Language**     | TypeScript (strict) on Node.js 26               |
| **Storage**      | PostgreSQL (TypeORM) + S3                       |
| **Vision / AI**  | Anthropic Claude (feeder classify)              |
| **Auth**         | ECDSA device authentication                     |
| **IaC**          | CloudFormation                                  |
| **Testing**      | Jest with 80% global coverage thresholds        |
| **Analysis**     | ESLint + Prettier                               |
| **CI/CD**        | GitHub Actions                                  |
| **Git Hooks**    | Husky + lint-staged + Conventional Commits      |

### Repository Structure

```
crow-detector-server/
├── src/
│   ├── auth/                   # ECDSA guard
│   ├── common/                 # Logger, shared types
│   ├── config/                 # Typed Nest config (env schema)
│   ├── detection/              # ClaudeService for feeder classify
│   ├── feeder/                 # Public dispense + feeder visits/clips
│   ├── health/                 # Health checks
│   ├── porch/                  # Public porch clip list
│   ├── urls/                   # Presigned S3 URL issuance (porch/feeder)
│   ├── app.module.ts
│   └── main.ts
├── pi/                         # Porch + feeder recorders on the LAN host
├── cloudformation/             # ECS, RDS, ALB, S3, IAM
├── scripts/                    # Tunnel, DB seed, auth token, host deploy helpers
├── test/                       # e2e + Jest setup
├── docs/                       # Governance + domain documentation
├── .cursor/                    # Cursor rules, skills, commands
├── .github/                    # CI workflows + PR/issue templates
├── .husky/                     # Git hooks
├── CONTEXT.md                  # Primary AI entry point
├── AGENTS.md                   # This file
├── Makefile                    # Developer commands
├── package.json
├── jest.config.js
└── api.yaml                    # OpenAPI contract
```

---

## Development Commands

Prefer `make` targets. Run **`make`** or **`make help`** for a compact list.

### Quality / CI

| Command                     | Description                                 |
| --------------------------- | ------------------------------------------- |
| `make lint`                 | Root ESLint                                 |
| `make format`               | Prettier write                              |
| `make format-check`         | Prettier check (no write)                   |
| `make test`                 | Root Jest suite                             |
| `make test-cov`             | Root Jest with coverage                     |
| `make build`                | Nest production build                       |
| `make porch-test`           | Porch recorder Python helper unit tests     |
| `make preflight`            | Lint, format-check, typecheck, test, build  |
| `make ci`                   | Alias for `preflight`                       |
| `make commit`               | Interactive Commitizen commit               |
| `make review-inventory`     | Review file inventory (`KIND=pr` or `repo`) |
| `make review-check`         | Check a review ledger (`LEDGER=path`)       |
| `make review-eval-validate` | Check seeded review cases still apply       |

### Local API / DB

| Command                                               | Description                                                                                                                      |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `npm run start:dev`                                   | Nest watch + SSH tunnel to RDS                                                                                                   |
| `npm run db:seed`                                     | Seed database                                                                                                                    |
| `npm run db:reset`                                    | Reset + seed                                                                                                                     |
| `npm run auth:token`                                  | Generate ECDSA auth token helper                                                                                                 |
| `./scripts/deploy-porch-host.sh`                      | LAN host: SSH `git pull` + restart `porch-recorder` (`DEPLOY_HOST=juzu-inui`; repo default `~/Development/crow-detector-server`) |
| `./scripts/deploy-feeder-host.sh`                     | LAN host: SSH `git pull` + restart `feeder-recorder` (same clone; `FEEDER_GIT_REF` defaults to the current branch)               |
| `./scripts/deploy-feeder-visits-host.sh`              | LAN host: SSH `git pull` + restart `feeder-visits` (`pi/feeder-recorder.py --visits`)                                            |
| `python3 pi/record-on-motion.py --once`               | One RTSP clip + upload (host bring-up)                                                                                           |
| `python3 -m unittest pi/test_record_on_motion_lib.py` | Porch recorder helper unit tests                                                                                                 |

---

## Language & Framework Rules

### TypeScript

- `tsconfig.json` enables `strictNullChecks`, `strictPropertyInitialization`, `noImplicitAny`, `strictBindCallApply`, and `noFallthroughCasesInSwitch`. Do not weaken those flags. The full `"strict": true` bundle is not on.
- Do **not** use `any` in production code without a justification comment. Tests may use `any` where needed.
- Prefer `interface` for object shapes; use `type` for unions/intersections/aliases.
- Prefer named exports over default exports.
- Use explicit return types on public service methods and controllers where practical.

### NestJS

- One feature domain per module (`feed`, `detection`, `urls`, `health`, `auth`).
- Controllers: HTTP mapping + DTO validation only.
- Services: business logic; inject AWS/Claude clients via Nest DI.
- DTOs: `class-validator` / `class-transformer`; enable global `ValidationPipe`.
- Entities: TypeORM entities under `entity/`; do not import entities into shared type barrels in a way that creates cycles.
- Provide shared services (e.g. `S3MetadataService`) once and **export** them from their owning module.

### Naming

| Element               | Convention         | Example                   |
| --------------------- | ------------------ | ------------------------- |
| Files                 | `kebab-case.ts`    | `ecdsa-auth.guard.ts`     |
| Classes               | `PascalCase`       | `FeederVisitService`      |
| Functions / variables | `camelCase`        | `createFeederClip`        |
| Constants             | `UPPER_SNAKE_CASE` | `FEEDER_CLIP_MAX_BYTES`   |
| Types / Interfaces    | `PascalCase`       | `AnimalAnalysisResult`    |
| Nest tests            | `<module>.spec.ts` | `urls.controller.spec.ts` |

### Error Handling

- Never swallow errors with empty `catch` blocks.
- Log errors with context via bunyan (`src/common/logger`).
- Fail fast on missing required configuration unless `NODE_ENV` is `development`, `test`, or ECS `dev`.
- Map domain failures to appropriate Nest HTTP exceptions.

### Immutability & Style

- Prefer `const`; avoid reassignment.
- Keep functions and methods small and single-purpose.
- Match existing import and formatting conventions (ESLint + Prettier).

---

## Architecture Rules

### Nest module pattern

```
controller → service → TypeORM repository / AWS SDK / Claude SDK
```

| Layer      | Responsibility                                             |
| ---------- | ---------------------------------------------------------- |
| Controller | Routes, guards, DTO validation                             |
| Service    | Business logic, orchestration, status workflows            |
| Entity     | Persistence shape                                          |
| Guard      | ECDSA (and future) authentication                          |
| Config     | Typed env loading; no ad-hoc `process.env` in feature code |

### Photo pipeline (removed)

The still-photo S3 → SQS → Lambda → `/feed` / `/detection` path is gone. Do not reintroduce `feed/` or `detection/` object prefixes, Rekognition, or a nested `lambda/` package without a product decision. Feeder animal frames still use `ClaudeService` via `POST /feeder/classify`. Drop leftover tables with `scripts/db-seed/drop-photo-pipeline.sql` (hand-applied).

### CloudFormation

- Use `ImportValue` for shared `aws-infra-*` VPC/subnet/SG exports — **never** hardcode foreign subnet/SG IDs.
- Environment-aware exports: prod must import prod DB endpoints, not hardcoded `*-dev-*` exports.
- Infra changes require human approval.

### Config

- Read application configuration through the Nest config module / typed helpers under `src/config/`.
- New env vars MUST be documented in `docs/ENVIRONMENT.md` and `.env.example`.

---

## Performance Rules

- Avoid N+1 TypeORM queries; use relations/joins when fetching related entities.
- Keep CloudWatch log volume meaningful — not full S3 payloads at `info`.
- Presigned URL TTLs should stay short and intentional.

---

## Logging Rules

- Nest: use bunyan via `src/common/logger` — never `console.log` in production paths.
- **NEVER** log secrets, tokens, API key prefixes, AWS credentials, or private keys.
- Include enough context to diagnose failures (module, event id, operation).
- Use appropriate levels: `debug` for verbose, `info` for lifecycle, `warn`/`error` for failures.

---

## Security Rules

### Secrets

- **NEVER** hardcode API keys, tokens, passwords, or AWS credentials in source.
- Use environment variables / Secrets Manager; document in `docs/ENVIRONMENT.md` and `.env.example`.
- Store CI/CD secrets in GitHub Actions secrets — never in repository files.
- No dummy Anthropic/Claude key fallbacks on production code paths.

### Auth (ECDSA)

- Device auth uses ECDSA signatures (`x-device-id`, `x-signature`, `x-timestamp`).
- Dev bypass (`NODE_ENV=development` + `x-dev-mode: true`) MUST NOT activate when `NODE_ENV=production`.
- Document bypass clearly; never enable equivalent shortcuts in ECS task env for prod.

### AWS

- Follow least-privilege IAM in CloudFormation.
- Do not broaden security group or IAM permissions without human review.
- Prefer proper Postgres TLS CA verification. Production/prod always verifies; `SSL_REJECT_UNAUTHORIZED=false` is a non-prod temporary opt-out only (see `docs/SECURITY.md`).

### Dependencies

- New dependencies require human approval.
- Do not upgrade TypeORM to 1.x without explicit approval.
- Keep the root lockfile intentional.

---

## Testing Rules

- Maintain **80%** coverage thresholds (statements, branches, functions, lines).
- Nest: co-locate `*.spec.ts`.
- Mock AWS SDK, Anthropic, and network I/O in unit tests.
- Do not overtest Nest boilerplate (empty modules); test behavior.
- Add tests for new shared helpers and security-sensitive paths (auth, config fail-fast).

---

## Git & Commit Rules

### Conventional Commits

```
<type>(<scope>): <subject>
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `style`, `perf`, `chore`, `build`, `ci`, `revert`

Scopes (commitlint enum): `auth`, `feed`, `detection`, `feeder`, `porch`, `urls`, `health`, `common`, `config`, `ci`, `docs`, `deps`, `infra`, `docker`

Prefer `make commit` (Commitizen).

### Hooks

- `pre-commit`: lint-staged (ESLint + Prettier on staged files)
- `commit-msg`: commitlint
- `pre-push`: `make preflight`
- Never use `--no-verify` unless the user explicitly requests it

### Branches

See `docs/CONTRIBUTING.md` for naming prefixes (`feat/`, `fix/`, `chore/`, etc.).

---

## Forbidden Patterns

- Hardcoded secrets or dummy production API keys
- Logging Claude API key material (including prefixes)
- Re-providing the same service in multiple Nest modules instead of exporting
- Importing TypeORM entities into shared type barrels in ways that create cycles
- Hardcoding `aws-infra` subnet/SG IDs (use `ImportValue`)
- Copying signal-calculation / monorepo patterns from unrelated repos
- Reducing coverage thresholds or skipping hooks
- TypeORM 1.x upgrades without human approval

---

## AI Agent Checklist

Before finishing work:

- [ ] Read CONTEXT + AGENTS + mandatory docs
- [ ] Changes match Nest module boundaries; do not revive the photo Lambda path
- [ ] Env vars documented if added
- [ ] Tests updated; coverage still ≥ 80%
- [ ] No secrets in logs or source
- [ ] Conventional Commits with valid scope
- [ ] Will pass `make preflight` before push
- [ ] For a review, the ledger passes `npm run review:check`
