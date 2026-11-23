# CloudFormation (INF)

**Review kinds:** pr, repo
**Applies when:** any file under `cloudformation/` or `lambda/cloudformation/` is in scope, and on every repo review.
**Policy:** `docs/ARCHITECTURE.md` (CloudFormation), `docs/SECURITY.md` (IAM). Infra changes need human review.

## How to review

Read the template and the environment it will be deployed to. Prod must not import a `*-dev-*` export. Then check data stores (RDS, S3, SQS) for encryption, public access, deletion policy, and backups, and check the task definition for where secrets live.

## Criteria

- **INF-01** (MUST) Networking uses `ImportValue` of `aws-infra-*` exports. No subnet, security group, or VPC id is hardcoded. Verify: search `subnet-`, `sg-`, and `vpc-` literals.
- **INF-02** (MUST) Imports are environment-correct. A prod mapping does not import a dev export. Verify: read each `Fn::ImportValue` next to the `Environment` condition.
- **INF-03** (MUST) S3 blocks public access, denies non-TLS, and does not grant `s3:*` to `*`. Verify: read `PublicAccessBlockConfiguration` and the bucket policy.
- **INF-04** (SHOULD) RDS is not publicly accessible, storage is encrypted, backups have a retention, deletion protection is on for prod, and `DeletionPolicy` is `Snapshot` or `Retain`. Verify: read `crow-detector-rds.yaml`.
- **INF-05** (MUST) Database credentials and the Claude key reach the task through Secrets Manager `secrets`, not plain `Environment` values. Verify: read the container definition.
- **INF-06** (SHOULD) The task role and the execution role are separate, and each policy lists the actions it needs. Rekognition `Resource: '*'` is acceptable only where `docs/SECURITY.md` says AWS requires it. Verify: read `crow-detector-iam-roles.yaml`.
- **INF-07** (SHOULD) The ECS service has a health-check grace period and a deployment circuit breaker with rollback. Verify: read the service resource.
- **INF-08** (SHOULD) The ALB serves HTTPS, redirects HTTP, and uses a current TLS policy. Security group ingress is limited to the load balancer or the intended CIDR. Verify: read `crow-detector-alb.yaml`.
- **INF-09** (MUST) SQS has a redrive policy and a DLQ, and its visibility timeout matches [lambda.md](lambda.md) LAM-07. Verify: read `crow-detector-sqs.yaml`.
- **INF-10** (SHOULD) Prod and dev resource names match `docs/ENVIRONMENT.md` and the workflows. Verify: compare the names.

## Automatic-fail signals

- A hardcoded subnet or security group id.
- Prod importing a dev export.
- A secret written as a plain environment value in the task definition.
- A bucket without public-access block.
