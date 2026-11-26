# Architecture

> **Precedence:** CONTEXT.md > GOVERNANCE.md > **ARCHITECTURE.md** > feature docs.
>
> **AI agents — read this file when:** adding Nest modules, modifying CloudFormation, or altering data flow.

---

## Overview

This repository powers the **Crow Detector** interactive crow feeder backend:

- **NestJS 11 + Fastify** API on **ECS Fargate** (Node 26)
- **PostgreSQL** via **TypeORM 0.3** for feeder dispense requests and animal visits
- **S3** for porch and feeder video clips; **Claude Haiku** for feeder frame classify
- **ECDSA** device authentication for `pi-user`, `pi-feeder`, and `pi-porch`

The still-photo pipeline (S3 `feed/`/`detection/` → SQS → Lambda → Nest `/feed`/`/detection` + Rekognition) is **removed**. Do not reintroduce it without a product decision.

Shared networking (VPC, subnets, security groups) comes from the **`aws-infra-*`** CloudFormation exports via `ImportValue`. Do **not** hardcode foreign subnet/SG IDs.

---

## High-level data flow

```
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ LAN recorder │ → │ Presigned PUT│ → │ S3 porch/ or │
│ (ECDSA)      │   │ /urls/porch  │   │ feeder/      │
│              │   │ /urls/feeder │   │              │
└──────────────┘   └──────────────┘   └──────────────┘

┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ Feeder host  │ → │ POST         │ → │ Claude Haiku │
│ frame JPEG   │   │ /feeder/     │   │ (ClaudeSvc)  │
│              │   │ classify     │   │              │
└──────────────┘   └──────────────┘   └──────────────┘
```

1. Devices request porch/feeder presigned URLs from Nest (`urls` module).
2. MP4 objects land under `porch/` or `feeder/` (lifecycle rules in the images stack).
3. Feeder animal visits may sample frames and call `POST /feeder/classify`.
4. Public clients list Shelter Cam via `/porch/clips`. Feeder Cam uses
   `GET /feeder/status` (cooldown) and `GET /feeder/feeds` (proof + visit
   sections); `GET /feeder/clips` remains for back-compat flat visit lists.

---

## Nest module layout

| Module      | Responsibility                                            |
| ----------- | --------------------------------------------------------- |
| `auth`      | ECDSA guard                                               |
| `detection` | `ClaudeService` only (feeder classify)                    |
| `feeder`    | Public status/feeds/dispense/clips, visits, host classify |
| `porch`     | Public porch clip list with short-lived playback URLs     |
| `urls`      | Presigned S3 URL creation (`/urls/porch`, `/urls/feeder`) |
| `health`    | Health endpoints                                          |
| `common`    | Logger, shared types                                      |
| `config`    | Typed environment configuration                           |

Capture hardware and the LAN uploader plan are in **`docs/DEVICES.md`**. Reference recorders: `pi/record-on-motion.py` (porch) and `pi/feeder-recorder.py` (feeder proofs + `--visits`). Deploy with `scripts/deploy-porch-host.sh`, `scripts/deploy-feeder-host.sh`, and `scripts/deploy-feeder-visits-host.sh`.

Merge-to-main deploys the **ECS task** stack only. The 30-day `porch/` and `feeder/` lifecycle rules live in `cloudformation/crow-detector-s3.yaml` and must be applied with a one-shot deploy of the S3 stack after that template changes (it is not part of `merge.yml`).

### Boundary rules

- Controllers stay thin; services own business logic.
- Shared services are provided once and **exported** — do not duplicate providers across modules.
- Avoid cycles: shared `common/types` must not import TypeORM entities.
- Config is read through Nest `ConfigModule` / typed helpers — avoid new raw `process.env` in feature services.
- Global `ValidationPipe` is enabled in `main.ts`.
- Schema changes are hand-applied SQL (for example `scripts/db-seed/drop-photo-pipeline.sql`). Do not enable TypeORM `synchronize`.

---

## Build & deploy shape

- **API Docker** image: multi-stage Node 26 Alpine; Nest build; ECS Fargate (`linux/amd64`).
- **CloudFormation** (`cloudformation/`): RDS, ALB, ECS task/service, S3, IAM.
- Environments: `dev` / `prod` parameter mappings — env-specific imports must match (`crow-detector-db-${Environment}-*`), never hardcode `*-dev-*` in prod paths.

---

## Local development

| Mechanism         | Path / command                             |
| ----------------- | ------------------------------------------ |
| Nest + RDS tunnel | `npm run start:dev`                        |
| Auth helper       | `npm run auth:token`                       |
| DB helpers        | `npm run db:seed` / `db:reset` / `db:test` |
| Quality           | `make preflight`                           |
