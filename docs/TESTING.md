# Testing

> **Precedence:** CONTEXT.md > GOVERNANCE.md > ARCHITECTURE.md > **TESTING.md**.
>
> **AI agents — read this file when:** writing tests, changing coverage config, or reviewing test quality.

---

## Strategy

| Layer                     | What to test                             | How                                     |
| ------------------------- | ---------------------------------------- | --------------------------------------- |
| Nest services             | Business logic with mocked deps          | Unit `*.spec.ts`                        |
| Nest controllers / guards | HTTP mapping, ECDSA auth edges           | Unit with Nest testing module           |
| Nest DTOs / pipes         | Validation behavior when relevant        | Unit or e2e                             |
| Porch / feeder Python     | Motion helpers, ECDSA signing, recorders | `make porch-test` (`pi/test_*.py`)      |
| e2e                       | Smoke bootstrap / ValidationPipe wiring  | `test/*.e2e-spec.ts` (optional locally) |

Integration against real AWS, RDS, or Claude is **out of scope** for the default Jest suite.

---

## Layout

### Root (Nest)

- Co-located: `foo.ts` → `foo.spec.ts`
- Jest config: `jest.config.js` (`testRegex: (src/.*\\.spec\\.ts|scripts/review/.*\\.test\\.js)$`)
- Setup: `test/setup.ts`

### LAN recorders (`pi/`)

- `python3 -m unittest discover -s pi -p 'test_*.py'` via `make porch-test`

---

## Coverage

Configured in the root Jest config:

- **80%** global thresholds for branches, functions, lines, statements
- Enforced in GitHub Actions PR workflows
- Do not lower thresholds without a governance change

```bash
make test
make test-cov
make porch-test
```

---

## Mocking

- Mock AWS SDK v3 clients (S3)
- Mock Anthropic / Claude clients
- Mock TypeORM repositories / QueryRunners as needed
- Never call real S3, Claude, or RDS in unit tests
- Fake clocks/timers for cooldown / timestamp logic when needed

---

## Philosophy

Tests should serve **documentation**, **confidence**, and **safety**.

### Do test

- Public service methods with logic
- Auth guard accept/reject paths (including ensuring prod cannot use dev bypass)
- Feeder dispense status transitions and visit key validation
- Error handling and fail-fast config
- Porch/feeder Python helpers that build signatures or motion windows

### Do not overtest

- Empty Nest module declarations
- Pure DTO class field lists without validation behavior
- Framework wiring that adds no project-specific logic

---

## Commands

| Command            | Scope                          |
| ------------------ | ------------------------------ |
| `make test`        | Root Jest                      |
| `make test-cov`    | Root Jest + coverage           |
| `make porch-test`  | Porch/feeder Python unit tests |
| `npm run test:e2e` | Nest e2e (when needed)         |
