---
name: dependency-upgrade
description: >-
  Guide npm dependency additions and upgrades for Crow Detector Server (root and
  lambda/). New dependencies require human approval. Use when changing
  package.json or evaluating libraries.
---

# Dependency Upgrade

Read: `docs/SECURITY.md`, `docs/GOVERNANCE.md`, `CONTEXT.md` escalation rules.

**New dependencies require human approval.** Do not add packages autonomously.

---

## Workflow

1. State the problem the dependency solves.
2. Check whether existing code/deps already cover it.
3. Evaluate: maintenance, license, size, transitive risk, TypeScript types, Nest 11 / TypeORM 0.3 peers.
4. Prefer minimal, well-known packages aligned with the stack (Nest, AWS SDK v3, Anthropic).
5. Get explicit human approval before editing `package.json` / `lambda/package.json`.
6. After approval:

```bash
npm install <package>
cd lambda && npm install <package>
```

7. On a major upgrade, read the installed package's changelog and type declarations under `node_modules/` and compare every call site in this repo with the new API. Unknown options are often ignored silently.
8. Review install scripts: `npm approve-scripts --allow-scripts-pending` in the root and, when `lambda/` changed, in `lambda/`. Approve only scripts you can explain.
9. Run `npm audit --audit-level=high` in each package you changed, then `make preflight`.
10. Update docs if the dependency changes developer workflow.
11. Commit with scope `deps` (e.g. `chore(deps): add foo`).

---

## MUST NOT

- Add deps “just in case”
- Jump TypeORM to 1.x without explicit human approval
- Leave one lockfile upgraded and the other stale when both are affected
- Ignore peer/engine conflicts — hold and document instead
