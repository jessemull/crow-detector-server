# Conventions tooling does not enforce (CONV)

**Review kinds:** pr, repo
**Applies when:** always.
**Policy:** `AGENTS.md` (Naming, Commits), `docs/CONTRIBUTING.md`, `docs/COMMENTS.md`.

## How to review

Lint and Prettier cover formatting of `*.ts`. They do not cover names, commit scopes, comment spacing, or Python and YAML style. Check those by eye.

## Criteria

- **CONV-01** (SHOULD) File, class, and function names follow `AGENTS.md`: kebab-case files, PascalCase classes, camelCase functions. Verify: read new names.
- **CONV-02** (SHOULD) Nest tests are `*.spec.ts` next to the source. Lambda tests are `*.test.ts` next to the source. Verify: read the paths.
- **CONV-03** (SHOULD) Commit subjects match commitlint: a scope from the enum, imperative, lowercase, no trailing period. Verify: `git log --oneline <base>..HEAD`.
- **CONV-04** (SHOULD) The commitlint scope enum, `docs/CONTRIBUTING.md`, and `AGENTS.md` list the same scopes. A new scope is added in all three. Verify: compare the lists.
- **CONV-05** (NICE) Comment spacing follows `docs/COMMENTS.md`. Verify: read new standalone comments.
- **CONV-06** (SHOULD) Shell scripts use `set -euo pipefail` and quote expansions. Python follows the surrounding style. Verify: read the first lines and the interpolations.
- **CONV-07** (SHOULD) Changed YAML, Markdown, and JSON match Prettier, which lint-staged runs for those extensions. Changed Python and shell match the surrounding style by inspection, because Prettier has no parser for them. Verify: read the diff.

## Automatic-fail signals

- A commit the hook should have rejected, which means the hook did not run. Pair with GATE-01.
