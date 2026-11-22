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
| `SSL_REJECT_UNAUTHORIZED` | Opt out of RDS CA verify (`false` only). Ignored in `production`/`prod` (always verify). Non-prod temporary use only. | No | verify (`true`) |

In ECS, username/password come from Secrets Manager; host/name from CloudFormation exports.

---

## ECDSA device keys (Nest)

Public keys are typically base64-encoded PEM strings:

| Variable               | Description                    | Required |
| ---------------------- | ------------------------------ | -------- |
| `PI_USER_PUBLIC_KEY`   | User Pi device public key      | Prod yes |
| `PI_MOTION_PUBLIC_KEY` | Motion Pi device public key    | Prod yes |
| `PI_FEEDER_PUBLIC_KEY` | Feeder Pi device public key    | Prod yes |
| `PI_PORCH_PUBLIC_KEY`  | Porch camera Pi public key     | Prod yes |
| `LAMBDA_S3_PUBLIC_KEY` | S3 Lambda caller public key    | Prod yes |

Local helpers may also use filesystem paths (scripts only):

| Variable                    | Description                |
| --------------------------- | -------------------------- |
| `PI_USER_PRIVATE_KEY_PATH`  | Path to user private key   |
| `PI_MOTION_PRIVATE_KEY_PATH`| Path to motion private key |
| `PI_FEEDER_PRIVATE_KEY_PATH`| Path to feeder private key |
| `PI_PORCH_PRIVATE_KEY_PATH` | Path to porch private key  |
| `PI_*_PUBLIC_KEY_PATH`      | Path variants for scripts  |

| Variable               | Description                                      | Required | Default |
| ---------------------- | ------------------------------------------------ | -------- | ------- |
| `CORS_ALLOWED_ORIGINS` | Comma-separated origins for the public clip list | No       | Critter Canteen site (+ localhost `:3000` / `:8080` when `NODE_ENV` is not `prod`/`production`) |

Porch LAN recorder (host laptop/server, not Nest) — see `docs/DEVICES.md` and `pi/porch.env.example`:

| Variable                      | Description                                      | Required | Default |
| ----------------------------- | ------------------------------------------------ | -------- | ------- |
| `PORCH_API_BASE_URL`          | API base for ECDSA porch uploads                 | Yes      | - (bring-up: `https://api-dev.crittercanteen.com`) |
| `PORCH_RTSP_URL`              | Full RTSP URL including Camera Account user/pass | Yes      | - |
| `PORCH_RTSP_SAMPLE_URL`       | Override warm pipeline URL (defaults to `stream2` derived from `PORCH_RTSP_URL`) | No | derived `stream2` |
| `PI_PORCH_PRIVATE_KEY_PATH`   | Path to porch private key on the host            | No       | `~/keys/pi-porch-private.pem` |
| `PORCH_MOTION_THRESHOLD`      | Frame-diff score (0–1) that counts as motion     | No       | `0.035` |
| `PORCH_IDLE_SECONDS`          | Quiet window before ending a visit               | No       | `3` |
| `PORCH_VISIT_COOLDOWN_SECONDS`| Pause after a visit before arming again          | No       | `30` |
| `PORCH_PRE_ROLL_SECONDS`      | Seconds before motion retained from continuous segments | No | `4` |
| `PORCH_POST_ROLL_SECONDS`     | Seconds after motion retained from continuous segments | No | `20` |
| `PORCH_SEGMENT_TIME_SECONDS`  | Continuous remux segment length                  | No       | `2` |
| `PORCH_LOCAL_RETENTION_SECONDS` | Max age of local segment files before prune    | No       | `180` |

Host secrets live in `~/porch.env` (`chmod 600`) and are never committed. Prefer systemd (`scripts/porch-recorder.service`) on the LAN host; deploy code with `./scripts/deploy-porch-host.sh`.

Deploy script env (Mac → host):

| Variable         | Description | Default |
| ---------------- | ----------- | ------- |
| `DEPLOY_HOST`    | SSH target (`juzu-inui` via Tailscale + `~/.ssh/config`) | required |
| `PORCH_REPO_DIR` | Clone path **on the host** (quote `~` so it expands remotely) | `~/Development/crow-detector-server` |
| `PORCH_SERVICE`  | systemd unit | `porch-recorder` |
| `PORCH_GIT_REF`  | Branch to fast-forward on the host | current local branch |

Example: `DEPLOY_HOST=juzu-inui PORCH_GIT_REF=main ./scripts/deploy-porch-host.sh`

SSH login key (Mac): `~/.ssh/id_ed25519_porch` — not the same as `~/keys/pi-porch-private.pem` (API ECDSA on the host).

The outdoor porch path is **LAN host + RTSP**, not Pi CSI/PIR.

---

## AWS / S3 / AI (Nest)

| Variable           | Description                              | Required | Default     |
| ------------------ | ---------------------------------------- | -------- | ----------- |
| `AWS_REGION`       | AWS region                               | No       | `us-west-2` |
| `S3_BUCKET_NAME`   | Image bucket                             | Yes      | -           |
| `CLAUDE_API_KEY`   | Anthropic API key                        | Prod yes | -           |
| `CLAUDE_MODEL`     | Claude model id                          | No       | `claude-haiku-5-5` |
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
