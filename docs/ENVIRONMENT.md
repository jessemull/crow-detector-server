# Environment Variables

Application code should read these through Nest config helpers (`src/config/`) rather than scattering raw `process.env` in feature modules. Lambda reads its own env at runtime (and webpack may define build-time defaults for local packaging).

Copy `.env.example` to `.env` for local development. **Never commit `.env`.**

---

## Runtime

| Variable   | Description                         | Required | Default       |
| ---------- | ----------------------------------- | -------- | ------------- |
| `NODE_ENV` | `development` / `test` / `production` | No     | `development` |
| `PORT`     | HTTP listen port                    | No       | `3000`        |
| `LOG_LEVEL`| Bunyan level (`info`, `debug`, …)   | No       | `info`        |

---

## PostgreSQL (Nest / TypeORM)

| Variable                  | Description                                      | Required | Default |
| ------------------------- | ------------------------------------------------ | -------- | ------- |
| `RDS_HOST`                | Postgres hostname                                | Yes (non-dev fail-fast) | - |
| `RDS_PORT`                | Postgres port                                    | No       | `5432`  |
| `RDS_DATABASE`            | Database name                                    | Yes      | -       |
| `RDS_USERNAME`            | Database user                                    | Yes      | -       |
| `RDS_PASSWORD`            | Database password                                | Yes      | -       |
| `SSL_REJECT_UNAUTHORIZED` | When `false`, disable TLS cert verify (temporary)| No       | prefer verify |

In ECS, username/password come from Secrets Manager; host/name from CloudFormation exports.

---

## ECDSA device keys (Nest)

Public keys are typically base64-encoded PEM strings:

| Variable               | Description                    | Required |
| ---------------------- | ------------------------------ | -------- |
| `PI_USER_PUBLIC_KEY`   | User Pi device public key      | Prod yes |
| `PI_MOTION_PUBLIC_KEY` | Motion Pi device public key    | Prod yes |
| `PI_FEEDER_PUBLIC_KEY` | Feeder Pi device public key    | Prod yes |
| `LAMBDA_S3_PUBLIC_KEY` | S3 Lambda caller public key    | Prod yes |

Local helpers may also use filesystem paths (scripts only):

| Variable                    | Description                |
| --------------------------- | -------------------------- |
| `PI_USER_PRIVATE_KEY_PATH`  | Path to user private key   |
| `PI_MOTION_PRIVATE_KEY_PATH`| Path to motion private key |
| `PI_FEEDER_PRIVATE_KEY_PATH`| Path to feeder private key |
| `PI_*_PUBLIC_KEY_PATH`      | Path variants for scripts  |

---

## AWS / S3 / AI (Nest)

| Variable           | Description                              | Required | Default     |
| ------------------ | ---------------------------------------- | -------- | ----------- |
| `AWS_REGION`       | AWS region                               | No       | `us-west-2` |
| `S3_BUCKET_NAME`   | Image bucket                             | Yes      | -           |
| `CLAUDE_API_KEY`   | Anthropic API key                        | Prod yes | -           |
| `CLAUDE_MODEL`     | Claude model id                          | No       | `claude-3-opus-20240229` |
| `FEED_COOLDOWN_HOURS` | Hours between feeds                   | No       | `4`         |

---

## Local tunnel / bastion (scripts)

| Variable           | Description                         | Required for tunnel |
| ------------------ | ----------------------------------- | ------------------- |
| `BASTION_HOST`     | Bastion hostname                    | Yes                 |
| `SSH_USER`         | SSH user                            | Yes                 |
| `SSH_KEY_PATH`     | Path to SSH private key             | Yes                 |
| `SSH_PORT`         | SSH port                            | No (22)             |
| `DESTINATION_HOST` | Optional override for tunnel target | No                  |
| `RDS_HOST`         | Remote RDS host for port-forward    | Yes                 |

`npm run start:tunnel` must use env (`RDS_HOST`), not a hardcoded RDS hostname.

---

## Lambda package

| Variable               | Description                              | Required |
| ---------------------- | ---------------------------------------- | -------- |
| `API_BASE_URL`         | Nest API base URL                        | Yes      |
| `DETECTION_ENDPOINT`   | Detection path (default `/detection`)    | No       |
| `FEED_ENDPOINT`        | Feed path (default `/feed`)              | No       |
| `LAMBDA_S3_PRIVATE_KEY`| Base64 private key for ECDSA signing     | Yes      |
| `NODE_ENV`             | Controls verbose logging in tests        | No       |

Webpack may embed defaults for local packaging; runtime env in AWS should set real values.

---

## Node versions

| Surface        | Node version | Notes                          |
| -------------- | ------------ | ------------------------------ |
| Nest API / ECS | **26**       | `.nvmrc` / `package.json` engines |
| Lambda runtime | **24**       | AWS Lambda max (`nodejs24.x`); Node 26 not offered yet |

---

## GitHub Actions

Set repository secrets/vars as required by deploy workflows (AWS credentials or OIDC role, ECR, etc.). Prefer OIDC when available (`docs/SECURITY.md`).
