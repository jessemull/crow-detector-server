# Governance

> **Precedence:** CONTEXT.md > **GOVERNANCE.md** > ARCHITECTURE.md > feature docs > inline comments.
>
> **AI agents — read this file when:** making any structural decision, resolving conflicting guidance, determining what requires human review, or proposing changes to governance docs themselves.

---

## Source-of-truth precedence

When guidance conflicts, the higher-ranked document wins:

| Rank | Document                                            | Scope                                        |
| ---- | --------------------------------------------------- | -------------------------------------------- |
| 1    | `CONTEXT.md`                                        | Project identity, constraints, quality gates |
| 2    | `GOVERNANCE.md`                                     | Process, constraints, authority, enforcement |
| 3    | `ARCHITECTURE.md`                                   | Structure, modules, dependency rules         |
| 4    | Feature docs (`ENVIRONMENT.md`, `SECURITY.md`, etc.) | Domain-specific guidance                    |
| 5    | Inline code comments                                | Local intent, non-obvious rationale          |

Resolve upward, never downward.

---

## Non-negotiable constraints

### Language and type safety

- **TypeScript strict mode is mandatory.**
- **No `any` in production code** without a justification comment. Tests may relax this.
- Prefer explicit types on public APIs.

### Architecture

- **Nest module pattern:** controllers → services → TypeORM / AWS / Claude.
- **Lambda stays nested** under `lambda/` with its own package boundary.
- **Config from env** via Nest config / typed helpers — document new vars.

### Testing and quality

- **80% Jest coverage** thresholds must not be reduced without governance change.
- **Conventional Commits** required.
- **Formatting/linting automated** via Prettier + ESLint.

### Safety and security

- **No hardcoded secrets.**
- **No secrets/PII in logs.**
- **ECDSA prod bypass forbidden.**

---

## Decision authority

### Autonomous (AI agents and developers may proceed without review)

- Bug fixes that do not change external API contracts
- Adding tests
- Improving documentation within existing doc files
- Code formatting and lint fixes
- Internal refactors that do not change module boundaries or public contracts
- Adding inline comments that explain non-obvious intent

### Requires human review (PR approval mandatory)

- New npm dependencies (root or `lambda/`)
- Changes to any governance doc (`CONTEXT.md`, `AGENTS.md`, this file, architecture/security policy)
- Changes to CI/CD pipelines (`.github/workflows/`)
- Changes to CloudFormation / IAM
- Security-sensitive code (credentials, ECDSA keys, secret handling, logging of sensitive data)
- Breaking OpenAPI / DTO / S3 layout contracts
- Removal of tests or reduction of coverage thresholds
- TypeORM major version jumps (especially 1.x)

### Requires explicit product decision

- New device types or auth schemes
- Changes to feeding cooldown / gallery product behavior with user impact
- Data retention or privacy policy changes
- New third-party AI providers

---

## Change process for governance docs

1. **Propose:** Open a PR with the change. Title should include `[governance]`.
2. **Justify:** Explain why, what problem it solves, and prior guidance.
3. **Review:** Minimum one human reviewer with write access. Changes to `GOVERNANCE.md` itself prefer two reviewers when possible.
4. **Cascade:** If the change invalidates lower-ranked docs, update those in the same PR or a linked follow-up promptly.

---

## Enforcement mechanisms

| Mechanism                        | What it checks                                                                                         | Blocks?       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------- |
| Husky pre-commit (`lint-staged`) | ESLint + Prettier on staged files                                                                      | Yes (commit)  |
| Husky commit-msg                 | Conventional Commits + scope enum                                                                      | Yes (commit)  |
| Husky pre-push                   | `make preflight` (root + lambda)                                                                       | Yes (push)    |
| GitHub Actions PR workflow       | lint, format-check, test (Jest 80%), build; npm audit (high+, blocking once clean)                     | Yes (merge)   |
| GitHub Actions lambda PR         | lambda lint, test, package                                                                             | Yes (merge)   |
| GitHub Actions deploy workflows  | quality gates then deploy                                                                              | Yes (deploy)  |
| PR review                        | Architecture, security, tests                                                                          | Yes (process) |

Skipping hooks is not acceptable for shared branches — CI will catch violations regardless.

---

## Escalation rules

1. **Lint / CI failure:** Fix locally. If the rule seems wrong, open a governance change PR — do not disable the rule inline without the exception process.
2. **Conflicting guidance:** Apply the precedence chain. If still ambiguous, escalate to a human maintainer.
3. **AI agent uncertainty:** If unsure whether a change is autonomous or requires review, **flag for human review**. False positives are acceptable; false negatives are not.
4. **Security concern:** Escalate immediately to a human maintainer. Do not “fix and forget.”

---

## Exception process

When a non-negotiable constraint truly cannot be met:

1. Document in the PR: constraint, why unavoidable, scope, mitigation.
2. Tag in code: `// EXCEPTION: <constraint> — <reason> — <PR link>`
3. Require explicit human approval before merge.
4. Track follow-up to remove the exception.
