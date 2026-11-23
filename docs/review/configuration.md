# Configuration and environment (CFG)

**Review kinds:** pr, repo
**Applies when:** any env read, `.env.example`, config helper, or task-definition env change is in scope, and on every repo review.
**Policy:** `docs/ENVIRONMENT.md`, `AGENTS.md` (Config).

## How to review

New configuration belongs in `src/config` and in `docs/ENVIRONMENT.md` plus `.env.example`. Feature code should not grow new `process.env` reads. Production and prod must be treated as the same deployed environment wherever the code branches on the name.

## Criteria

- **CFG-01** (MUST) Every new or renamed variable appears in code, `.env.example`, and `docs/ENVIRONMENT.md` under the same name and the same required/default story. Verify: search the name.
- **CFG-02** (MUST) Feature services do not read `process.env` directly. They take typed config. The guard's request-time `NODE_ENV` read is the documented exception. Verify: search `process.env` under `src/` outside `src/config` and the guard.
- **CFG-03** (MUST) A branch that treats `production` as deployed also treats `prod`, or the task definition's value is the one the code checks. They must not disagree. Verify: read each `NODE_ENV` comparison and the task definition.
- **CFG-04** (MUST) Missing required config fails closed outside development. Verify: read `loadAppConfig` for the variable.
- **CFG-05** (SHOULD) Defaults match the docs. A code default the doc does not mention, or a doc default the code does not use, is a finding. Verify: compare the two.
- **CFG-06** (SHOULD) `.gitignore` covers `.env` and key files, and the examples contain placeholders only. Verify: read `.gitignore` and `.env.example`.
- **CFG-07** (SHOULD) Lambda env and root env are not mixed. A variable read in `lambda/src` is documented in the Lambda section of `docs/ENVIRONMENT.md`. Verify: search in `lambda/src`.

## Automatic-fail signals

- A new variable documented in only one of code, example, and `docs/ENVIRONMENT.md`.
- `production` and `prod` taking different security decisions.
