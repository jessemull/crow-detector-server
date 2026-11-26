# Contracts and integration (CON)

**Review kinds:** pr, repo
**Applies when:** any export, DTO, entity field, route, env var, S3 key, header, or cross-package interface is added, changed, renamed, or deleted.
**Policy:** `docs/ARCHITECTURE.md`, `docs/ENVIRONMENT.md`, `docs/DEVICES.md`, `api.yaml`.

## How to review

For every changed or deleted name, search the whole repository and the docs:

```bash
rg -n "<name>" --hidden -g '!node_modules' -g '!dist' -g '!coverage'
```

Record the search and every hit. Read each caller. For contracts that leave the repo (the client, the LAN host, AWS), state what the other side expects and mark anything you cannot see as VERIFY.

Contracts a reviewer must trace:

- ECDSA signed string: `method + url + JSON.stringify(body) + timestamp` (non-ASCII kept as-is), built in `src/auth/middleware/ecdsa-auth.guard.ts`, `pi/record_on_motion_lib.py` / `pi/feeder-recorder.py`, and `scripts/generate-auth-token.ts`. Those builders must match.
- Device ids: `pi-user`, `pi-feeder`, `pi-porch` (`pi-motion` / `lambda-s3` removed with the photo pipeline).
- S3 prefixes: `porch/` and `feeder/` for clips. Do not reintroduce `feed/` or `detection/` without a product decision.
- Porch and feeder clip lists: the JSON shapes `api.yaml` documents and the services return.
- Presigned URL responses: field names and expiry units shared with the uploaders.
- Env names: `docs/ENVIRONMENT.md`, `.env.example`, `pi/porch.env.example`, `pi/feeder.env.example`, workflow `env:` blocks, and `src/config/app.config.ts`.

## Criteria

- **CON-01** (MUST) Every changed or removed export, DTO field, entity column, or constant has all its users found and updated. Verify: the repo-wide search, with hits recorded.
- **CON-02** (MUST) Deleted or renamed files and symbols leave no stale references in imports, tests, workflows, docs, rule globs, or skills. Verify: search the old name and the old path.
- **CON-03** (MUST) `api.yaml` matches the controllers: paths, methods, status codes, request bodies, and response shapes. Verify: compare each changed route with its operation.
- **CON-04** (MUST) Env var names are identical across code, `.env.example`, `pi/porch.env.example`, `pi/feeder.env.example`, workflow env blocks, and `docs/ENVIRONMENT.md`. Verify: search each changed or added name.
- **CON-05** (MUST) The ECDSA signed string, header names, and timestamp unit are identical in the guard, the Python signers, and the token script. Verify: read those builders side by side.
- **CON-06** (MUST) Sibling paths stay in parity. When one of several similar paths changes (porch vs feeder deploy scripts, dev vs prod workflow jobs), the others change too or the difference is stated. Verify: list the siblings and compare them.
- **CON-07** (SHOULD) S3 prefixes, suffixes, and key layouts agree across the URL service, playback signing, and bucket lifecycle rules. Verify: compare the definitions.
- **CON-08** (SHOULD) Entity columns, DTO fields, and `api.yaml` schemas describe the same data, including nullability and enums. Verify: read all three for each changed field.
- **CON-09** (SHOULD) Error responses use the status codes the contract documents, and clients can tell the cases apart. Verify: compare thrown exceptions with the spec.
- **CON-10** (MUST) A change to a contract another system depends on (OpenAPI, DTO shape, S3 layout, signed string) is called out as breaking and names the other side. Verify: read the diff and the PR description.

## Automatic-fail signals

- A renamed or deleted symbol, env var, route, header, or prefix still referenced anywhere.
- The signed string built differently on two sides of the same request.
- `api.yaml` describing a route the code does not serve, or the reverse.
