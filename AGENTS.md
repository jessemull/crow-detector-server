# AGENTS.md — Crow Detector Server

> Complete development rules and constraints for AI agents and human contributors.
> This file is the authoritative reference for all coding standards, architecture rules, and workflow requirements.

---

## Repository Overview

| Field            | Value                                                              |
| ---------------- | ------------------------------------------------------------------ |
| **Project**      | Crow Detector — interactive crow feeder backend                    |
| **Architecture** | NestJS modular monolith (ECS Fargate) + nested `lambda/` package   |
| **Language**     | TypeScript (strict) on Node.js 26 (API); Lambda runtime Node.js 24 |
| **Storage**      | PostgreSQL (TypeORM) + S3                                          |
| **Vision / AI**  | AWS Rekognition + Anthropic Claude                                 |
| **Auth**         | ECDSA device authentication                                        |
| **IaC**          | CloudFormation                                                     |
| **Testing**      | Jest with 80% global coverage thresholds                           |
| **Analysis**     | ESLint + Prettier                                                  |
| **CI/CD**        | GitHub Actions                                                     |
| **Git Hooks**    | Husky + lint-staged + Conventional Commits                         |

### Repository Structure

```
crow-detector-server/
├── src/
│   ├── auth/                   # ECDSA guard
│   ├── common/                 # Logger, shared types
│   ├── config/                 # Typed Nest config (env schema)
│   ├── detection/              # Detection events, Claude, image processing
│   ├── feed/                   # Feed events, image processing, S3 metadata
│   ├── health/                 # Health checks
│   ├── urls/                   # Presigned S3 URL issuance
│   ├── app.module.ts
│   └── main.ts
├── lambda/                     # Nested package: S3 → SQS → API glue
│   ├── src/
│   ├── cloudformation/
│   ├── webpack.config.js
│   └── package.json
├── cloudformation/             # ECS, RDS, ALB, S3, IAM
├── scripts/                    # Tunnel, DB seed, auth token helpers
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

| Command               | Description                                      |
| --------------------- | ------------------------------------------------ |
| `make lint`           | Root ESLint                                      |
| `make format`         | Prettier write                                   |
| `make format-check`   | Prettier check (no write)                        |
| `make test`           | Root Jest suite                                  |
| `make test-cov`       | Root Jest with coverage                          |
| `make build`          | Nest production build                            |
| `make lambda-lint`    | Lambda ESLint                                    |
| `make lambda-test`    | Lambda Jest                                      |
| `make lambda-build`   | Lambda webpack build + zip package               |
| `make preflight`      | Root + lambda lint/format/test/build             |
| `make ci`             | Alias for `preflight`                            |
| `make commit`         | Interactive Commitizen commit                    |

### Local API / DB

| Command            | Description                                      |
| ------------------ | ------------------------------------------------ |
| `npm run start:dev`| Nest watch + SSH tunnel to RDS                   |
| `npm run db:seed`  | Seed database                                    |
| `npm run db:reset` | Reset + seed                                     |
| `npm run auth:token` | Generate ECDSA auth token helper               |

---

## Language & Framework Rules

### TypeScript

- Strict mode is **always enabled**. Do not weaken `tsconfig.json`.
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

| Element               | Convention          | Example                    |
| --------------------- | ------------------- | -------------------------- |
| Files                 | `kebab-case.ts`     | `ecdsa-auth.guard.ts`      |
| Classes               | `PascalCase`        | `FeedEventService`         |
| Functions / variables | `camelCase`         | `createFeedEvent`          |
| Constants             | `UPPER_SNAKE_CASE`  | `FEED_COOLDOWN_HOURS`      |
| Types / Interfaces    | `PascalCase`        | `AnimalAnalysisResult`     |
| Nest tests            | `<module>.spec.ts`  | `feed.controller.spec.ts`  |
| Lambda tests          | `<module>.test.ts`  | `processor.test.ts`        |

### Error Handling

- Never swallow errors with empty `catch` blocks.
- Log errors with context via bunyan (`src/common/logger`).
- Fail fast on missing required configuration in non-development environments.
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

| Layer      | Responsibility                                              |
| ---------- | ----------------------------------------------------------- |
| Controller | Routes, guards, DTO validation                              |
| Service    | Business logic, orchestration, status workflows             |
| Entity     | Persistence shape                                           |
| Guard      | ECDSA (and future) authentication                           |
| Config     | Typed env loading; no ad-hoc `process.env` in feature code  |

### Lambda package

- Lives under `lambda/` with its own `package.json`, Jest, ESLint, webpack.
- Responsibility: consume S3/SQS events, sign ECDSA requests, call Nest API.
- Keep runtime Node **20** documented until an intentional upgrade; API uses Node **22**.
- Do not import Nest source from Lambda (or vice versa).

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
- Prefer streaming / bounded buffers for large images; Sharp operations should be explicit about size.
- Keep CloudWatch log volume meaningful — not full S3/SQS payloads at `info`.
- Presigned URL TTLs should stay short and intentional.

---

## Logging Rules

- Nest: use bunyan via `src/common/logger` — never `console.log` in production paths.
- Lambda: use structured logging helpers; never dump full SQS/S3/API payloads.
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
- Rekognition `Resource: '*'` may be required by AWS — do not invent a finding if AWS mandates it.
- Prefer proper Postgres TLS CA verification; if `rejectUnauthorized: false` remains temporarily, document it in `docs/SECURITY.md`.

### Dependencies

- New dependencies require human approval.
- Do not upgrade TypeORM to 1.x without explicit approval.
- Keep root and `lambda/` lockfiles intentional.

---

## Testing Rules

- Maintain **80%** coverage thresholds (statements, branches, functions, lines).
- Nest: co-locate `*.spec.ts`; Lambda: co-locate `*.test.ts`.
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

Scopes (commitlint enum): `auth`, `feed`, `detection`, `urls`, `health`, `common`, `config`, `lambda`, `ci`, `docs`, `deps`, `infra`, `docker`

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
- `console.log` of full SQS/S3 payloads in Lambda
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
- [ ] Changes match Nest / Lambda boundaries
- [ ] Env vars documented if added
- [ ] Tests updated; coverage still ≥ 80%
- [ ] No secrets in logs or source
- [ ] Conventional Commits with valid scope
- [ ] Will pass `make preflight` before push
