---
name: testing
description: >-
  Jest testing workflow for Crow Detector Server (Nest *.spec.ts and Lambda
  *.test.ts): coverage, mocks, and testing philosophy. Use when writing,
  fixing, or reviewing tests.
---

# Testing

Read: `docs/TESTING.md`, `AGENTS.md` § Testing Rules, `jest.config.js`, `lambda/jest.config.js`.

---

## Goals

Tests provide documentation, confidence, and safety for refactoring.

---

## Workflow

1. Identify behavior under test (service / guard / lambda processor).
2. Add or update co-located Nest `*.spec.ts` or Lambda `*.test.ts`.
3. Mock AWS / Anthropic / TypeORM / network.
4. Cover happy path, failure path, and edge cases.
5. Run:

```bash
make test
# or scoped:
npx jest path/to/file.spec.ts
cd lambda && npm test
```

6. Confirm global coverage still meets 80%.

---

## Patterns

- Nest TestingModule for DI
- Mock `ConfigService` for env-dependent services
- Assert ECDSA prod bypass cannot activate
- Prefer behavioral assertions over implementation snapshots
