# Dockerfile and image (DOCK)

**Review kinds:** pr, repo
**Applies when:** `Dockerfile`, `.dockerignore`, or an image build step is in scope, and on every repo review.
**References:** OWASP Docker security cheat sheet.

## How to review

The image is what ECS runs. Read the Dockerfile top to bottom and ask what ends up in the final layer: source, dev dependencies, secrets, the RDS CA bundle, and which user the process runs as.

## Criteria

- **DOCK-01** (MUST) The final stage does not copy `.env`, keys, or `.npmrc` tokens. `.dockerignore` excludes `.env`, `.git`, and local key directories. Verify: read both files.
- **DOCK-02** (SHOULD) The base image is pinned by digest or by a version that matches `.nvmrc` (Node 26), and the final stage installs production dependencies only (`npm ci --omit=dev` or a multi-stage copy of `node_modules`). Verify: read the `FROM` lines and the install command.
- **DOCK-03** (SHOULD) The process does not run as root. A `USER` is set before `CMD`. Verify: read the final stage.
- **DOCK-04** (SHOULD) The image includes the RDS CA bundle the app expects, and the path in the image matches `src/config/rds-ca.ts`. Verify: compare the `COPY` with the path the code reads.
- **DOCK-05** (SHOULD) PID 1 forwards signals, so ECS can stop the task. `node` as PID 1 is acceptable only if the app handles SIGTERM. Verify: read `CMD` and the shutdown hooks in `src/main.ts`.
- **DOCK-06** (SHOULD) A container health check exists, or the task definition's health check calls the same endpoint the ALB uses. Verify: read `HEALTHCHECK` and the task definition.

## Automatic-fail signals

- A secret copied into the image.
- A final stage that runs as root with no stated reason.
