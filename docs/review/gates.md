# Gates and tool evidence (GATE)

**Review kinds:** pr, repo
**Applies when:** always.
**Policy:** `CONTEXT.md` (Quality Gates), `docs/TESTING.md`, `docs/SECURITY.md`.

## How to review

Run the gates yourself and record each command, exit code, and the key output in the ledger's `gates[]`. A gate you did not run is `not-run`, which forces the verdict to `incomplete`. Then look past the exit codes: the tools have known blind spots in this repo, and a green run does not cover them.

There are two packages. Root gates do not cover `lambda/`, and lambda gates do not cover the root. Both must run.

Known blind spots (check by hand, do not assume the tools did):

- `tsconfig.json` sets `noImplicitAny: false`, `strictBindCallApply: false`, and `strictPropertyInitialization: false`, and `noFallthroughCasesInSwitch` is off. `npx tsc --noEmit -p tsconfig.json` also fails today because Jest globals are not in the type scope for `*.spec.ts`; the gate uses `tsconfig.build.json`, which excludes tests, so tests are not typechecked.
- Root ESLint uses `recommendedTypeChecked`, but `no-explicit-any` is off, and `no-floating-promises`, `no-unsafe-*`, and `no-unused-vars` are warnings. `npm run lint` passes `--fix` and does not use `--max-warnings 0`.
- `scripts/**/*.ts` and tests have the `no-unsafe-*` rules turned off entirely.
- `lint-staged` only lists `*.ts`. YAML, Python, shell, Markdown, and JSON are not formatted on commit.
- Coverage thresholds are global, so one file can sit below 80%. `*.dto.ts`, `*.entity.ts`, `main.ts`, and `index.ts` are excluded from coverage.
- `make preflight` runs porch tests; the lambda PR workflow does not.

## Criteria

- **GATE-01** (MUST) Husky hooks are installed and the branch's commits pass commitlint. Verify: `git config core.hooksPath` is `.husky/_`, `test -d .husky/_`, and `npx --no-install commitlint --from <base> --to HEAD` exits 0.
- **GATE-02** (MUST) The Node version matches `.nvmrc` and root `engines` (26). Lambda runtime stays Node 24. Verify: `node -v`; record it in the gates evidence.
- **GATE-03** (MUST) `make lint` and `make lambda-lint` exit 0, and changed files add no new warnings. Verify: run both and list warnings in changed files; each new warning is a finding because lint does not fail on warnings.
- **GATE-04** (MUST) Typecheck exits 0 for both packages. Verify: `npx tsc --noEmit -p tsconfig.build.json` and `(cd lambda && npx tsc --noEmit -p tsconfig.json)`.
- **GATE-05** (SHOULD) Formatting is clean for both packages. Verify: `make format-check` and `make lambda-format-check` exit 0. Changed YAML, Python, shell, and Markdown are formatted consistently by inspection, since lint-staged does not cover them.
- **GATE-06** (MUST) `make test`, `make lambda-test`, and `make porch-test` exit 0 with the 80% thresholds met. Verify: run them and read the coverage summary; note per-file branch coverage for changed files.
- **GATE-07** (MUST) `make build` and `make lambda-build` exit 0. Verify: run them.
- **GATE-08** (MUST) `npm audit --audit-level=high` was run in the root and in `lambda/`, and every high or critical finding is triaged. Verify: run both and record the counts.
- **GATE-09** (SHOULD) `npm run test:e2e` ran when bootstrap, the global pipe, or module wiring changed. Verify: run it, or record `not-run` with the reason.
- **GATE-10** (MUST) Every changed file in a tool blind spot above was reviewed by hand against the TypeScript, security, and database criteria the tools would otherwise enforce. Verify: list those files in the evidence.
- **GATE-11** (MUST) No suppression was added to get a gate green: `eslint-disable`, `@ts-ignore`, `@ts-expect-error` without a reason, `c8 ignore` or `istanbul ignore` added to hide a branch, new coverage exclusions, `continue-on-error`, `--no-verify`, `HUSKY=0`, `.skip` or `.only`, `synchronize: true`, or lowered thresholds. Verify: `git diff <base>...HEAD | rg -n "eslint-disable|ts-ignore|ts-expect-error|c8 ignore|istanbul ignore|continue-on-error|no-verify|HUSKY=0|\\.skip\\(|\\.only\\(|coverageThreshold|synchronize"`.

## Automatic-fail signals

- Any required gate failed, or was not run and the verdict is not `incomplete`.
- `.husky/_` missing while commits were made.
- A suppression, exclusion, or threshold change that exists only to pass a gate.
