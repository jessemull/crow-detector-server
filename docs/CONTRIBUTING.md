# Contributing

> **Precedence:** CONTEXT.md > GOVERNANCE.md > ARCHITECTURE.md > **CONTRIBUTING.md** > inline comments.
>
> **AI agents — read this file when:** creating a branch, writing a commit message, preparing a PR, or advising on the contribution workflow.

---

## Getting started

### Prerequisites

- Node.js 26+ (see `.nvmrc`) for the Nest API
- Node.js 24 Lambda runtime target under `lambda/` (AWS managed max)
- npm
- AWS credentials (for deploy / tunnel workflows)
- Docker (optional, for API image builds)

### Bootstrap

```bash
git clone https://github.com/jessemull/crow-detector-server.git
cd crow-detector-server
npm install
cd lambda && npm install && cd ..
cp .env.example .env   # fill in values; never commit .env
```

Husky hooks install via the `prepare` script on root `npm install`.

### Verify

```bash
make preflight
```

---

## Branch naming

| Prefix                         | Use                                   |
| ------------------------------ | ------------------------------------- |
| `feat/<short-description>`     | New features                          |
| `fix/<short-description>`      | Bug fixes                             |
| `refactor/<short-description>` | Restructuring without behavior change |
| `docs/<short-description>`     | Documentation only                    |
| `test/<short-description>`     | Adding or fixing tests                |
| `chore/<short-description>`    | Tooling, CI, dependency updates       |
| `perf/<short-description>`     | Performance improvements              |

Use lowercase kebab-case.

---

## Commit conventions

Follow [Conventional Commits](https://www.conventionalcommits.org/). Prefer `make commit` (Commitizen).

### Format

```
<type>(<scope>): <subject>
```

### Types

`feat`, `fix`, `refactor`, `test`, `docs`, `style`, `perf`, `chore`, `build`, `ci`, `revert`

### Scopes

Enforced by commitlint: `auth`, `feed`, `detection`, `urls`, `health`, `common`, `config`, `lambda`, `ci`, `docs`, `deps`, `infra`, `docker`

### Rules

- Subject: imperative, lowercase, no period, max 72 characters
- Body explains _why_
- Breaking changes: `!` after type/scope or `BREAKING CHANGE:` footer

---

## PR process

1. Branch from `main`
2. Implement with tests
3. Ensure hooks pass (`lint-staged`, commitlint)
4. Push (runs `make preflight`)
5. Open PR using the GitHub template
6. Address review per `docs/REVIEW.md`

### PR checklist (summary)

- [ ] `make preflight` passes
- [ ] Coverage remains ≥ 80%
- [ ] Env changes documented (`.env.example` + `docs/ENVIRONMENT.md`)
- [ ] No secrets in logs or source
- [ ] Nest / Lambda boundaries respected

---

## Docs index

| Doc                    | Purpose                        |
| ---------------------- | ------------------------------ |
| `CONTEXT.md`           | AI entry + quality gates       |
| `AGENTS.md`            | Full contributor/agent rules   |
| `docs/GOVERNANCE.md`   | Authority & escalation         |
| `docs/ARCHITECTURE.md` | System design                  |
| `docs/TESTING.md`      | Test strategy                  |
| `docs/SECURITY.md`     | Security policy                |
| `docs/COMMENTS.md`     | Comment policy                 |
| `docs/ENVIRONMENT.md`  | Env var reference              |
| `docs/REVIEW.md`       | Review severity                |
| `docs/CONTRIBUTING.md` | This file                      |
