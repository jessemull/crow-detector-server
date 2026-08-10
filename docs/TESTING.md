# Testing

> **Precedence:** CONTEXT.md > GOVERNANCE.md > ARCHITECTURE.md > **TESTING.md**.
>
> **AI agents — read this file when:** writing tests, changing coverage config, or reviewing test quality.

---

## Strategy

| Layer                    | What to test                              | How                                      |
| ------------------------ | ----------------------------------------- | ---------------------------------------- |
| Nest services            | Business logic with mocked deps           | Unit `*.spec.ts`                         |
| Nest controllers / guards| HTTP mapping, ECDSA auth edges            | Unit with Nest testing module            |
| Nest DTOs / pipes        | Validation behavior when relevant         | Unit or e2e                              |
| Lambda processors / auth | SQS/S3 parsing, signing, API client       | Unit `*.test.ts`                         |
| e2e                      | Smoke bootstrap / ValidationPipe wiring   | `test/*.e2e-spec.ts` (optional locally)  |

Integration against real AWS, RDS, or Claude is **out of scope** for the default Jest suite.

---

## Layout

### Root (Nest)

- Co-located: `foo.ts` → `foo.spec.ts`
- Jest config: `jest.config.js` (`testRegex: src/.*\\.spec\\.ts$`)
- Setup: `test/setup.ts`

### Lambda

- Co-located: `foo.ts` → `foo.test.ts`
- Jest config: `lambda/jest.config.js`

---

## Coverage

Configured in root and lambda Jest configs:

- **80%** global thresholds for branches, functions, lines, statements
- Enforced in GitHub Actions PR workflows
- Do not lower thresholds without a governance change

```bash
make test
make test-cov
make lambda-test
```

---

## Mocking

- Mock AWS SDK v3 clients (S3, Rekognition)
- Mock Anthropic / Claude clients
- Mock TypeORM repositories / QueryRunners as needed
- Never call real S3, Rekognition, Claude, or RDS in unit tests
- Fake clocks/timers for cooldown / timestamp logic when needed

---

## Philosophy

Tests should serve **documentation**, **confidence**, and **safety**.

### Do test

- Public service methods with logic
- Auth guard accept/reject paths (including ensuring prod cannot use dev bypass)
- Image/status workflow transitions
- Error handling and fail-fast config
- Lambda event parsing and API call construction

### Do not overtest

- Empty Nest module declarations
- Pure DTO class field lists without validation behavior
- Framework wiring that adds no project-specific logic

---

## Commands

| Command              | Scope                          |
| -------------------- | ------------------------------ |
| `make test`          | Root Jest                      |
| `make test-cov`      | Root Jest + coverage           |
| `make lambda-test`   | Lambda Jest + coverage script  |
| `npm run test:e2e`   | Nest e2e (when needed)         |
