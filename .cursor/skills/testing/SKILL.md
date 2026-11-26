---
name: testing
description: >-
  Jest and porch/feeder Python testing workflow for Crow Detector Server:
  coverage, mocks, and testing philosophy. Use when writing, fixing, or
  reviewing tests.
---

# Testing

Read: `docs/TESTING.md`, `docs/review/testing.md`, `AGENTS.md` (Testing Rules), `jest.config.js`.

When you are reviewing rather than writing tests, the bar is `docs/review/testing.md`: name the test that would fail if the changed branch broke, and treat a test that cannot fail as a finding.

---

## Goals

Tests provide documentation, confidence, and safety for refactoring.

---

## Workflow

1. Identify behavior under test (service / guard / Python helper).
2. Add or update co-located Nest `*.spec.ts` or `pi/test_*.py`.
3. Mock AWS / Anthropic / TypeORM / network.
4. Cover happy path, failure path, and edge cases.
5. Run:

```bash
make test
make porch-test
# or scoped:
npx jest path/to/file.spec.ts
```

6. Confirm global coverage still meets 80%.

---

## Patterns

- Nest TestingModule for DI
- Mock `ConfigService` for env-dependent services
- Assert ECDSA prod bypass cannot activate
- Prefer behavioral assertions over implementation snapshots
