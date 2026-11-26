# Contracts and integration (CON)

**Review kinds:** pr, repo
**Applies when:** any export, DTO, entity field, route, env var, S3 key, header, or cross-package interface is added, changed, renamed, or deleted.
**Policy:** `docs/ARCHITECTURE.md`, `docs/ENVIRONMENT.md`, `docs/DEVICES.md`, `api.yaml`.

## How to review

For every changed or deleted name, search the whole repository, both packages, and the docs:

```bash
rg -n "<name>" --hidden -g '!node_modules' -g '!dist' -g '!coverage' -g '!lambda/dist'
```

Record the search and every hit. Read each caller. The Nest tree and `lambda/` do not share types, so a field renamed in one and not the other still compiles. For contracts that leave the repo (the client, the Pi, AWS), state what the other side expects and mark anything you cannot see as VERIFY.

Contracts a reviewer must trace:

- ECDSA signed string: `method + url + JSON.stringify(body) + timestamp`, built in `src/auth/middleware/ecdsa-auth.guard.ts`, `lambda/src/util/auth.ts`, `pi/record_on_motion_lib.py`, and `scripts/generate-auth-token.ts`. All four must build the same string.
- Device ids: `pi-user`, `pi-feeder`, `pi-porch` (`pi-motion` / `lambda-s3` removed with the photo pipeline).
- S3 prefixes: `feed/`, `detection/`, `porch/`. The Lambda and the bucket notifications must agree on which suffixes each prefix handles.
- Porch clip list: the JSON shape `api.yaml` and `porch-clips.service.ts` return, which the client renders.
- Presigned URL responses: field names and expiry units shared with the uploaders.
- Env names: `docs/ENVIRONMENT.md`, `.env.example`, `pi/porch.env.example`, workflow `env:` blocks, and `src/config/app.config.ts`.

## Criteria

- **CON-01** (MUST) Every changed or removed export, DTO field, entity column, or constant has all its users found and updated, in both packages. Verify: the repo-wide search, with hits recorded.
- **CON-02** (MUST) Deleted or renamed files and symbols leave no stale references in imports, tests, workflows, docs, rule globs, or skills. Verify: search the old name and the old path.
- **CON-03** (MUST) `api.yaml` matches the controllers: paths, methods, status codes, request bodies, and response shapes. Verify: compare each changed route with its operation.
- **CON-04** (MUST) Env var names are identical across code, `.env.example`, `pi/porch.env.example`, workflow env blocks, and `docs/ENVIRONMENT.md`. Verify: search each changed or added name.
- **CON-05** (MUST) The ECDSA signed string, header names, and timestamp unit are identical in the guard, the Lambda signer, the Python signer, and the token script. Verify: read all four builders side by side.
- **CON-06** (MUST) Sibling paths stay in parity. When one of several similar paths changes (feed vs detection, dev vs prod workflow jobs, root vs lambda config), the others change too or the difference is stated. Verify: list the siblings and compare them.
- **CON-07** (SHOULD) S3 prefixes, suffixes, and key layouts agree across the URL service, the Lambda, bucket notifications, and lifecycle rules. Verify: compare the definitions.
- **CON-08** (SHOULD) Entity columns, DTO fields, and `api.yaml` schemas describe the same data, including nullability and enums. Verify: read all three for each changed field.
- **CON-09** (SHOULD) Error responses use the status codes the contract documents, and clients can tell the cases apart. Verify: compare thrown exceptions with the spec.
- **CON-10** (MUST) A change to a contract another system depends on (OpenAPI, DTO shape, S3 layout, signed string) is called out as breaking and names the other side. Verify: read the diff and the PR description.

## Automatic-fail signals

- A renamed or deleted symbol, env var, route, header, or prefix still referenced anywhere.
- The signed string built differently on two sides of the same request.
- `api.yaml` describing a route the code does not serve, or the reverse.
