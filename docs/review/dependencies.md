# Dependencies and supply chain (DEP)

**Review kinds:** pr, repo
**Applies when:** `package.json`, `lambda/package.json`, either lockfile, or `overrides` change, and on every repo review.
**Policy:** `docs/GOVERNANCE.md` (new dependencies need human approval), `docs/SECURITY.md`.

## How to review

There are two lockfiles. A bump in one is not a bump in the other. New packages need a human, and TypeORM 1.x is forbidden without explicit approval.

## Criteria

- **DEP-01** (MUST) Each lockfile matches its `package.json`. A dependency added in one file is installed in that package. Verify: `npm ls --depth=0` at the root and in `lambda/` after `npm ci`, or read the lockfile entries for the changed names.
- **DEP-02** (MUST) No new runtime dependency is added without the human approval `docs/GOVERNANCE.md` requires. Verify: read the diff of both `package.json` files and the PR discussion.
- **DEP-03** (MUST) TypeORM is not upgraded to 1.x, and Nest, Fastify, and the AWS SDK majors stay on the versions `CONTEXT.md` names unless the PR is that upgrade. Verify: read the version ranges.
- **DEP-04** (SHOULD) `npm audit --audit-level=high` is clean in both packages, or each accepted advisory is named in the PR with a reason. Verify: the security gate output.
- **DEP-05** (SHOULD) Install scripts for new packages are reviewed. npm 12 will require `allowScripts`; a new package with a postinstall is called out. Verify: `npm install-scripts ls` or the package's `package.json`.
- **DEP-06** (SHOULD) `overrides` are explained. The existing `find-my-way` override is not dropped or widened without a reason. Verify: read the `overrides` field.
- **DEP-07** (SHOULD) A major upgrade's changelog was checked against how this repo uses the package. Verify: name the breaking changes and the call sites you read.
- **DEP-08** (NICE) Unused dependencies are removed in the same change that stops using them. Verify: search the import.

## Automatic-fail signals

- A new dependency with no approval.
- A lockfile that does not contain the dependency `package.json` declares.
- TypeORM 1.x.
