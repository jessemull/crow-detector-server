# Architecture

> **Precedence:** CONTEXT.md > GOVERNANCE.md > **ARCHITECTURE.md** > feature docs.
>
> **AI agents — read this file when:** adding Nest modules, changing Lambda glue, modifying CloudFormation, or altering data flow.

---

## Overview

This repository powers the **Crow Detector** interactive crow feeder backend:

- **NestJS 11 + Fastify** API on **ECS Fargate** (Node 22)
- **PostgreSQL** via **TypeORM 0.3** for feed/detection events
- **S3** for images; **Rekognition** for moderation/labels; **Claude** for animal/crow classification
- **ECDSA** device authentication for Raspberry Pi devices and the S3 Lambda
- Nested **`lambda/`** package (Node 20 runtime, webpack-bundled) that turns S3→SQS events into signed API calls

Shared networking (VPC, subnets, security groups) comes from the **`aws-infra-*`** CloudFormation exports via `ImportValue`. Do **not** hardcode foreign subnet/SG IDs.

---

## High-level data flow

```
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ Pi / client  │ → │  S3 upload   │ → │ SQS notify   │
│ (presigned)  │   │  (images)    │   │              │
└──────────────┘   └──────────────┘   └──────┬───────┘
                                             ▼
                                    ┌────────────────┐
                                    │ S3 Lambda      │
                                    │ (ECDSA signed) │
                                    └──────┬─────────┘
                                           ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ Postgres     │ ← │ Nest API     │ ← │ /feed|/detect│
│ (TypeORM)    │   │ (ECS)        │   │ + Rekog/Claude│
└──────────────┘   └──────────────┘   └──────────────┘
```

1. Devices/clients request presigned URLs from Nest (`urls` module).
2. Objects land in S3; bucket notifications enqueue SQS messages.
3. Lambda signs ECDSA requests and POSTs/PATCHes Nest feed/detection endpoints.
4. Nest processes images (Rekognition, Sharp, Claude), updates event status, stores metadata.

---

## Nest module layout

| Module       | Responsibility                                              |
| ------------ | ----------------------------------------------------------- |
| `auth`       | ECDSA guard                                                 |
| `feed`       | Feed events, face/crop pipeline, S3 metadata helpers        |
| `detection`  | Detection events, Rekognition labels, Claude classification |
| `urls`       | Presigned S3 URL creation                                   |
| `health`     | Health endpoints                                            |
| `common`     | Logger, shared types                                        |
| `config`     | Typed environment configuration                             |

### Boundary rules

- Controllers stay thin; services own business logic.
- Shared services (e.g. `S3MetadataService`) are provided once and **exported** — do not duplicate providers across modules.
- Avoid cycles: shared `common/types` must not import TypeORM entities.
- Config is read through Nest `ConfigModule` / typed helpers — avoid new raw `process.env` in feature services.
- Global `ValidationPipe` is enabled in `main.ts`.

---

## Lambda package

| Concern     | Detail                                                      |
| ----------- | ----------------------------------------------------------- |
| Location    | `lambda/` nested npm package                                |
| Runtime     | Node.js **20** (AWS Lambda); document separately from API 22 |
| Build       | webpack → single bundle → zip                               |
| Role        | Parse S3/SQS events, ECDSA sign, call Nest API              |
| Isolation   | No imports from `../src` Nest tree                          |

---

## Build & deploy shape

- **API Docker** image: multi-stage Node 22 Alpine; Nest build; ECS Fargate.
- **Lambda**: `npm run build:package` in `lambda/`; deploy via lambda CloudFormation + GitHub workflows.
- **CloudFormation** (`cloudformation/`, `lambda/cloudformation/`): RDS, ALB, ECS task/service, S3, IAM, Lambda.
- Environments: `dev` / `prod` parameter mappings — env-specific imports must match (`crow-detector-db-${Environment}-*`), never hardcode `*-dev-*` in prod paths.

---

## Local development

| Mechanism        | Path / command                                      |
| ---------------- | --------------------------------------------------- |
| Nest watch       | `npm run start:dev` (tunnel + watch)                |
| SSH tunnel       | `scripts/tunnel.js` via `RDS_HOST` / bastion env    |
| DB seed          | `scripts/db-seed/`                                  |
| Auth token helper| `npm run auth:token`                                |
| Lambda unit tests| `cd lambda && npm test`                             |

---

## Related docs

- `docs/SECURITY.md` — ECDSA, secrets, TLS, IAM
- `docs/ENVIRONMENT.md` — all env vars
- `docs/TESTING.md` — Jest strategy
- `api.yaml` — HTTP contract
