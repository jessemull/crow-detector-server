# TypeORM, PostgreSQL, and migrations (DB)

**Review kinds:** pr, repo
**Applies when:** any entity, repository call, query, transaction, or database config is in scope, and on every repo review.
**Policy:** `AGENTS.md` (Performance, Architecture), `docs/ARCHITECTURE.md`. **References:** TypeORM 0.3 migrations and transactions docs.

## How to review

This repo uses TypeORM 0.3 against RDS. There is no migration folder today. `synchronize` stays false in the app and in the seed script, so schema changes are applied manually. `npm run db:synchronize` is a separate local-only command and refuses a non-local database. Treat `synchronize: true` on any deployed path as data loss. For each query, ask how many rows it can return and how many round trips a request makes.

## Criteria

- **DB-01** (MUST) `synchronize` is never true when `NODE_ENV` is `production` or `prod`. The seed script's synchronize command is not reachable from the ECS task. Verify: read `src/app.module.ts` and every `synchronize:` assignment.
- **DB-02** (MUST) No SQL string is built from request data. QueryBuilder parameters and repository `where` objects are the only interpolations. Verify: search `query(`, `createQueryBuilder`, and template literals in repository calls.
- **DB-03** (MUST) A multi-step update that must succeed or fail together runs in one transaction, and the `QueryRunner` is released in a `finally`. Verify: read each status change that writes more than one row or row plus S3 metadata.
- **DB-04** (SHOULD) Related rows are loaded with a join or a query builder, not a loop of `findOne`. Verify: count queries per request on the changed path.
- **DB-05** (SHOULD) Every `find` that can grow has a `take` (or equivalent) and an order. Verify: read each `find` and `findAndCount`.
- **DB-06** (MUST) Status updates are conditional on the current status, so two workers cannot both apply the same transition. Verify: read the `where` clause of each update.
- **DB-07** (SHOULD) New columns that are queried have an index, and new non-null columns have a default or a backfill story. Verify: read the entity decorators. Mark a live-table lock risk as VERIFY.
- **DB-08** (SHOULD) Dates are stored as `timestamptz` (or the existing column type, used consistently) and compared in one unit. Verify: read the column type and the comparison.
- **DB-09** (MUST) RDS TLS verifies the CA in `production` and `prod`. `SSL_REJECT_UNAUTHORIZED=false` cannot turn verification off there. Verify: read `src/config/rds-ca.ts` and the config branch.
- **DB-10** (SHOULD) Entities are not imported from `src/common/types` barrels. Verify: read the barrel imports.

## Automatic-fail signals

- `synchronize: true` on a path ECS can run.
- Request data concatenated into SQL.
- A status transition that two concurrent callers can both win.
