# Environment Variables

Application code should read these through Nest config helpers (`src/config/`) rather than scattering raw `process.env` in feature modules. Lambda reads `API_BASE_URL` from the function environment at runtime. The webpack bundle does not replace it.

Copy `.env.example` to `.env` for local development. **Never commit `.env`.**

---

## Runtime

| Variable    | Description                                                                                                                                | Required                                 | Default |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- | ------- |
| `NODE_ENV`  | `development`, `test`, or `dev` skip secret fail-fast. `production`, `prod`, and an unset value require secrets. ECS sets `dev` or `prod`. | Yes, except local `development` / `test` | none    |
| `PORT`      | HTTP listen port                                                                                                                           | No                                       | `3000`  |
| `LOG_LEVEL` | Bunyan level (`info`, `debug`, …)                                                                                                          | No                                       | `info`  |

---

## PostgreSQL (Nest / TypeORM)

| Variable                  | Description                                                                                                           | Required                                        | Default         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | --------------- |
| `RDS_HOST`                | Postgres hostname                                                                                                     | Yes except `development`, `test`, and ECS `dev` | -               |
| `RDS_PORT`                | Postgres port                                                                                                         | No                                              | `5432`          |
| `RDS_DATABASE`            | Database name                                                                                                         | Yes except `development`, `test`, and ECS `dev` | -               |
| `RDS_USERNAME`            | Database user                                                                                                         | Yes except `development`, `test`, and ECS `dev` | -               |
| `RDS_PASSWORD`            | Database password                                                                                                     | Yes except `development`, `test`, and ECS `dev` | -               |
| `SSL_REJECT_UNAUTHORIZED` | Opt out of RDS CA verify (`false` only). Ignored in `production`/`prod` (always verify). Non-prod temporary use only. | No                                              | verify (`true`) |

In ECS, username/password come from Secrets Manager; host/name from CloudFormation exports.

---

## ECDSA device keys (Nest)

Public keys are typically base64-encoded PEM strings:

| Variable               | Description                 | Required |
| ---------------------- | --------------------------- | -------- |
| `PI_USER_PUBLIC_KEY`   | User Pi device public key   | Prod yes |
| `PI_FEEDER_PUBLIC_KEY` | Feeder Pi device public key | Prod yes |
| `PI_PORCH_PUBLIC_KEY`  | Porch camera Pi public key  | Prod yes |

Local helpers may also use filesystem paths (scripts only):

| Variable                     | Description                |
| ---------------------------- | -------------------------- |
| `PI_USER_PRIVATE_KEY_PATH`   | Path to user private key   |
| `PI_FEEDER_PRIVATE_KEY_PATH` | Path to feeder private key |
| `PI_PORCH_PRIVATE_KEY_PATH`  | Path to porch private key  |

| Variable               | Description                                      | Required | Default                                                                                                              |
| ---------------------- | ------------------------------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------- |
| `CORS_ALLOWED_ORIGINS` | Comma-separated origins for the public clip list | No       | Critter Canteen site (+ `localhost` and `127.0.0.1` on `:3000` / `:8080` when `NODE_ENV` is not `prod`/`production`) |

Porch LAN recorder (host laptop/server, not Nest) — see `docs/DEVICES.md` and `pi/porch.env.example`:

| Variable                        | Description                                                                      | Required | Default                                            |
| ------------------------------- | -------------------------------------------------------------------------------- | -------- | -------------------------------------------------- |
| `PORCH_API_BASE_URL`            | API base for ECDSA porch uploads                                                 | Yes      | - (bring-up: `https://api-dev.crittercanteen.com`) |
| `PORCH_RTSP_URL`                | Full RTSP URL including Camera Account user/pass                                 | Yes      | -                                                  |
| `PORCH_RTSP_SAMPLE_URL`         | Override warm pipeline URL (defaults to `stream2` derived from `PORCH_RTSP_URL`) | No       | derived `stream2`                                  |
| `PI_PORCH_PRIVATE_KEY_PATH`     | Path to porch private key on the host                                            | No       | `~/keys/pi-porch-private.pem`                      |
| `PORCH_PIXEL_DELTA`             | Brightness change (0–255) that counts as a changed pixel                         | No       | `30`                                               |
| `PORCH_MIN_CHANGED_RATIO`       | Smallest share of the frame that can be an animal                                | No       | `0.004`                                            |
| `PORCH_MAX_CHANGED_RATIO`       | Largest share of the frame that can be an animal. Above this is a light change   | No       | `0.45`                                             |
| `PORCH_LIGHT_DISARM_RATIO`      | A change this large disarms detection until the picture is quiet again           | No       | `0.80`                                             |
| `PORCH_MIN_BLOB_FILL`           | Changed pixels must fill this much of their box                                  | No       | `0.25`                                             |
| `PORCH_MOTION_FRAMES`           | Compact frames in a row required to open or extend a visit                       | No       | `3`                                                |
| `PORCH_REFERENCE_ALPHA`         | How fast the background reference absorbs change                                 | No       | `0.02`                                             |
| `PORCH_VISIT_GAP_SECONDS`       | Quiet time that still belongs to the same visit                                  | No       | `120`                                              |
| `PORCH_VISIT_CAP_SECONDS`       | Hard maximum length of one visit                                                 | No       | `600`                                              |
| `PORCH_PRE_ROLL_SECONDS`        | Seconds before the first motion kept in the file                                 | No       | `4`                                                |
| `PORCH_POST_ROLL_SECONDS`       | Seconds after the last motion kept in the file                                   | No       | `20`                                               |
| `PORCH_SEGMENT_TIME_SECONDS`    | Continuous remux segment length                                                  | No       | `2`                                                |
| `PORCH_LOCAL_RETENTION_SECONDS` | Max age of local files once no visit is open                                     | No       | `900`                                              |

Host secrets live in `~/porch.env` (`chmod 600`) and are never committed. Prefer systemd (`scripts/porch-recorder.service`) on the LAN host; deploy code with `./scripts/deploy-porch-host.sh`.

Deploy script env (Mac → host):

| Variable         | Description                                                   | Default                              |
| ---------------- | ------------------------------------------------------------- | ------------------------------------ |
| `DEPLOY_HOST`    | SSH target (`juzu-inui` via Tailscale + `~/.ssh/config`)      | required                             |
| `PORCH_REPO_DIR` | Clone path **on the host** (quote `~` so it expands remotely) | `~/Development/crow-detector-server` |
| `PORCH_SERVICE`  | systemd unit                                                  | `porch-recorder`                     |
| `PORCH_GIT_REF`  | Branch to fast-forward on the host                            | current local branch                 |

Example: `DEPLOY_HOST=juzu-inui PORCH_GIT_REF=main ./scripts/deploy-porch-host.sh`

SSH login key (Mac): `~/.ssh/id_ed25519_porch` — not the same as `~/keys/pi-porch-private.pem` (API ECDSA on the host).

Feeder LAN recorder (host laptop/server, not Nest) — see `docs/DEVICES.md` and `pi/feeder.env.example`. This process does not read the porch variables.

| Variable                      | Description                                             | Required | Default                                            |
| ----------------------------- | ------------------------------------------------------- | -------- | -------------------------------------------------- |
| `FEEDER_API_BASE_URL`         | API base for feeder dispense, classify, and upload      | Yes      | - (bring-up: `https://api-dev.crittercanteen.com`) |
| `FEEDER_RTSP_URL`             | Full RTSP URL for the feeder camera                     | Yes      | -                                                  |
| `PI_FEEDER_PRIVATE_KEY_PATH`  | Path to the feeder private key on the host              | No       | `~/keys/pi-feeder-private.pem`                     |
| `FEEDER_PIXEL_DELTA`          | Same motion test as `PORCH_PIXEL_DELTA`                 | No       | `30`                                               |
| `FEEDER_MIN_CHANGED_RATIO`    | Same motion test as the porch minimum                   | No       | `0.004`                                            |
| `FEEDER_MAX_CHANGED_RATIO`    | Same light rejection as the porch maximum               | No       | `0.45`                                             |
| `FEEDER_LIGHT_DISARM_RATIO`   | A change this large disarms detection until quiet       | No       | `0.80`                                             |
| `FEEDER_MIN_BLOB_FILL`        | Same compact-patch test as the porch                    | No       | `0.25`                                             |
| `FEEDER_MOTION_FRAMES`        | Compact frames in a row required                        | No       | `3`                                                |
| `FEEDER_REFERENCE_ALPHA`      | Background reference blend                              | No       | `0.02`                                             |
| `FEEDER_VISIT_GAP_SECONDS`    | Quiet time that still belongs to the same visit         | No       | `120`                                              |
| `FEEDER_VISIT_CAP_SECONDS`    | Hard maximum length of one visit                        | No       | `600`                                              |
| `FEEDER_PRE_ROLL_SECONDS`     | Seconds before the first motion kept in the file        | No       | `4`                                                |
| `FEEDER_POST_ROLL_SECONDS`    | Seconds after the last motion kept in the file          | No       | `20`                                               |
| `FEEDER_SEGMENT_TIME_SECONDS` | Continuous remux segment length                         | No       | `2`                                                |
| `FEEDER_REQUIRE_ANIMAL`       | When `true`, drop visits Claude does not mark as animal | No       | `false`                                            |

Host secrets live in `~/feeder.env` (`chmod 600`) and are never committed. Two systemd units share that file. `scripts/feeder-recorder.service` records the 12-second dispense proof (`./scripts/deploy-feeder-host.sh`). `scripts/feeder-visits.service` runs `pi/feeder-recorder.py --visits` and publishes an animal visit (`./scripts/deploy-feeder-visits-host.sh`). Apply `scripts/db-seed/feeder-video.sql` before the routes are used. `--visit-once` records the next visit and exits. `--dispense-id` links that one visit to a proof.

Deploy script env (Mac → host):

| Variable                | Description                                                   | Default                              |
| ----------------------- | ------------------------------------------------------------- | ------------------------------------ |
| `DEPLOY_HOST`           | SSH target (`juzu-inui` via Tailscale + `~/.ssh/config`)      | required                             |
| `FEEDER_REPO_DIR`       | Clone path **on the host** (quote `~` so it expands remotely) | `~/Development/crow-detector-server` |
| `FEEDER_SERVICE`        | Proof unit (`deploy-feeder-host.sh`)                          | `feeder-recorder`                    |
| `FEEDER_VISITS_SERVICE` | Animal-visit unit (`deploy-feeder-visits-host.sh`)            | `feeder-visits`                      |
| `FEEDER_GIT_REF`        | Branch to fast-forward on the host                            | current local branch                 |

Example: `DEPLOY_HOST=juzu-inui FEEDER_GIT_REF=feat/feeder-video ./scripts/deploy-feeder-host.sh`

Example: `DEPLOY_HOST=juzu-inui FEEDER_GIT_REF=feat/feeder-video ./scripts/deploy-feeder-visits-host.sh`

The outdoor porch and feeder paths are **LAN host + RTSP**, not Pi CSI/PIR. Drop leftover photo tables with `scripts/db-seed/drop-photo-pipeline.sql` (hand-applied).

---

## AWS / S3 / AI (Nest)

| Variable         | Description       | Required | Default            |
| ---------------- | ----------------- | -------- | ------------------ |
| `AWS_REGION`     | AWS region        | No       | `us-west-2`        |
| `S3_BUCKET_NAME` | Images bucket     | Yes      | -                  |
| `CLAUDE_API_KEY` | Anthropic API key | Prod yes | -                  |
| `CLAUDE_MODEL`   | Claude model id   | No       | `claude-haiku-5-5` |

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

## Photo Lambda (removed)

The nested `lambda/` package and S3→SQS photo event path are gone. Do not set `LAMBDA_S3_*`, `DETECTION_ENDPOINT`, or `FEED_ENDPOINT`. After merging this removal, confirm in AWS that photo-pipeline stacks (S3 notifications / SQS / Lambda artifact) and any `lambda-s3-private-key` secret material are decommissioned — git delete alone does not destroy live stacks.

---

## Node versions

| Surface        | Node version | Notes                             |
| -------------- | ------------ | --------------------------------- |
| Nest API / ECS | **26**       | `.nvmrc` / `package.json` engines |

---

## GitHub Actions

Set `AWS_ROLE_ARN` to the role from `cloudformation/github-actions-oidc.yaml`. Deploy workflows assume that role with OIDC and do not use static access keys.
