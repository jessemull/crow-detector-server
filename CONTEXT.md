# CONTEXT.md — Crow Detector Server

> **This is the PRIMARY entry point for ALL AI agents working in this repository.**
> Read this file first. Follow the mandatory reading order below before making any changes.

---

## Mandatory Reading Order

Every agent MUST read the following documents **in order** before making any change:

1. **`CONTEXT.md`** (this file) — loading order, source-of-truth precedence, non-negotiable constraints, quality gates
2. **`AGENTS.md`** — complete development rules, architecture constraints, coding standards, and forbidden patterns
3. **`docs/GOVERNANCE.md`** — contribution workflow, PR process, review policy, release process
4. **`docs/ARCHITECTURE.md`** — NestJS modules, Lambda package, data flow, CloudFormation relationships
5. **`docs/TESTING.md`** — testing strategy, coverage requirements, mocking conventions
6. **`docs/COMMENTS.md`** — comment policy and documentation standards
7. **`docs/SECURITY.md`** — security policy, ECDSA auth, secret management, IAM guidance
8. **`docs/ENVIRONMENT.md`** — environment variables reference
9. **`docs/CONTRIBUTING.md`** — branch / commit / PR workflow
10. **`docs/REVIEW.md`** — PR review severity and checklists

Read items 5–10 on every task. Do not skip them because the work “seems unrelated”; agents cannot know upfront which rules will apply.

---

## Source-of-Truth Precedence

When instructions conflict, the **higher-numbered source wins**:

| Priority    | Source                                              | Scope                                         |
| ----------- | --------------------------------------------------- | --------------------------------------------- |
| 1 (highest) | `CONTEXT.md`                                        | Repository-wide constraints and quality gates |
| 2           | `docs/GOVERNANCE.md`                                | Contribution workflow and review policy       |
| 3           | `docs/ARCHITECTURE.md`                              | System design and module boundaries           |
| 4           | Feature docs (`docs/ENVIRONMENT.md`, SECURITY, etc.) | Domain-level design decisions                |
| 5 (lowest)  | Inline code comments                                | Local implementation notes                    |

**Lower-precedence instructions MUST NOT contradict higher-precedence instructions.** If a conflict is detected, flag it for human review and follow the higher-precedence source.

---

## Non-Negotiable Constraints

These constraints apply to **every change** in this repository. No exceptions without explicit human approval.

### Language & Type Safety

- **TypeScript strict mode**: always enabled; never weaken `tsconfig.json` strictness
- **No `any` without justification**: avoid unjustified `any` in production code (relaxed in `*.spec.ts` / `*.test.ts`)
- **Named exports preferred**: follow existing Nest module patterns

### Architecture

- **NestJS module pattern**: controllers → services → TypeORM entities / AWS SDK clients
- **Lambda is a nested package**: `lambda/` owns S3→SQS→API glue; do not fold it into Nest modules
- **Config from env only**: application config via Nest `ConfigModule` / typed config helpers — no scattered secrets in source
- **Shared AWS helpers** (e.g. S3 metadata) live in one Nest module and are exported — do not re-provide duplicates

### Testing

- **80% coverage threshold**: branches, functions, lines, and statements — enforced in CI
- **Co-located tests**: Nest `*.spec.ts` beside sources; Lambda `*.test.ts` beside sources
- **Mock external I/O**: AWS SDK, Anthropic, network, filesystem — never hit real AWS/Claude in unit tests

### Git & Quality

- **Conventional Commits**: enforced by commitlint + Commitizen
- **Never bypass hooks**: no `--no-verify` unless the user explicitly requests it
- **No hardcoded secrets**: API keys, credentials, and tokens never appear in source

---

## Architecture Boundaries

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Nest modules   │ ──► │   Services      │ ──► │ TypeORM / AWS   │
│  (controllers,  │     │  (feed, detect, │     │  Postgres, S3,  │
│   guards, DTOs) │     │   urls, Claude) │     │  Rekognition)   │
└─────────────────┘     └─────────────────┘     └─────────────────┘

┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  S3 upload      │ ──► │  SQS + Lambda   │ ──► │  Nest API       │
│  (Pi / client)  │     │  (ECDSA signed) │     │  /feed|/detect  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

| Rule                                                         | Enforcement                     |
| ------------------------------------------------------------ | ------------------------------- |
| Controllers stay thin — business logic in services           | Code review + architecture docs |
| TypeORM entities own persistence shape                       | Module convention               |
| ECDSA guard owns device auth                                 | Auth module                     |
| Lambda package stays isolated under `lambda/`                | Package boundary                |
| CloudFormation uses `ImportValue` for `aws-infra-*` networks | IaC review                      |

---

## Mandatory Quality Gates

| When               | Gate                                                                                                                          | Failure policy |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------- | -------------- |
| **Commit**         | Husky `pre-commit` — `lint-staged` (ESLint + Prettier on staged files)                                                        | Block commit   |
| **Commit message** | Husky `commit-msg` — commitlint (Conventional Commits + scope enum)                                                           | Block commit   |
| **Push**           | Husky `pre-push` — `make preflight` (root + lambda quality)                                                                   | Block push     |
| **PR / CI**        | GitHub Actions: lint, format-check, test (Jest 80%), build; lambda workflows; npm audit (high+, blocking once clean)          | Block merge    |

### When to run what (avoid duplicate work)

| Situation              | Command             | Notes                                             |
| ---------------------- | ------------------- | ------------------------------------------------- |
| **During development** | `make lint`, `make test`, scoped Jest | Fast iteration                      |
| **Before push**        | **`git push`**      | Husky runs full push validation                   |
| **Local full check**   | `make preflight`    | Optional before PR; same suite as push            |
| **Full repo audit**    | `make preflight`    | Release / `repo-review` skill only                |

**Do not** run `make preflight` and then `git push` in the same session unless you need an extra local confirmation — push re-runs the same suite.

```bash
make lint         # Root ESLint
make format       # Prettier write
make test         # Root Jest
make build        # Nest build
make lambda-lint  # Lambda ESLint
make lambda-test  # Lambda Jest
make lambda-build # Lambda webpack + package
make preflight    # Root + lambda quality gates
```

---

## Escalation Rules — Human Review Required

The following changes **MUST** be reviewed and approved by a human maintainer. AI agents MUST NOT merge these autonomously.

- **New dependencies**: any addition to root or `lambda/package.json`
- **Security changes**: credentials, IAM policies, ECDSA keys, secret handling, logging of sensitive data
- **Architecture changes**: new Nest modules, Lambda boundary changes, shared-module export patterns
- **CI/CD changes**: any modification to `.github/workflows/`
- **Infrastructure changes**: any modification to `cloudformation/` or `lambda/cloudformation/`
- **Governance document changes**: any edit to `CONTEXT.md`, `AGENTS.md`, or `docs/GOVERNANCE.md`
- **Coverage threshold changes**: reductions to Jest coverage thresholds
- **Breaking API / contract changes**: OpenAPI (`api.yaml`), DTO shapes, S3 key layouts consumed by Pi devices
- **TypeORM major upgrades**: do not jump to TypeORM 1.x without explicit human approval

> **Note:** This modernization effort (governance, tooling gates, dep upgrades within Nest 11 / TypeORM 0.3 peers, documented CFN/CI fixes) already has human approval.

---

## Confirmation Requirement

Before implementing any changes, confirm you have read and understood:

- [ ] `CONTEXT.md` — this file
- [ ] `AGENTS.md` — development rules
- [ ] `docs/GOVERNANCE.md`
- [ ] `docs/ARCHITECTURE.md`
- [ ] `docs/TESTING.md`
- [ ] `docs/COMMENTS.md`
- [ ] `docs/SECURITY.md`
- [ ] `docs/ENVIRONMENT.md`
- [ ] `docs/CONTRIBUTING.md`
- [ ] `docs/REVIEW.md`

**If any of the above documents do not yet exist, note their absence and proceed with the rules defined in `CONTEXT.md` and `AGENTS.md` as the authoritative sources.**

---

## Project Summary

| Field       | Value                                                         |
| ----------- | ------------------------------------------------------------- |
| Project     | Crow Detector Server                                          |
| Type        | NestJS 11 + Fastify TypeScript API + nested S3 Lambda         |
| Runtime     | Node.js 22 (API / ECS); Node.js 20 (Lambda runtime — documented) |
| Language    | TypeScript (strict)                                           |
| Compute     | AWS ECS Fargate + Lambda                                      |
| Storage     | PostgreSQL (TypeORM) + S3                                     |
| AI / Vision | AWS Rekognition + Anthropic Claude                            |
| Auth        | ECDSA device signatures                                       |
| IaC         | CloudFormation (`ImportValue` for `aws-infra-*`)              |
| Logging     | Bunyan → CloudWatch                                           |
| Testing     | Jest (80% coverage)                                           |
| Lint/Format | ESLint + Prettier                                             |
| Git         | Husky + lint-staged + Commitizen + Commitlint                 |
| CI          | GitHub Actions                                                |
