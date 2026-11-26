# Security

> **Precedence:** CONTEXT.md > GOVERNANCE.md > **SECURITY.md**.
>
> **AI agents — read this file when:** handling secrets, ECDSA, IAM, logging, dependencies, or security review.

---

## Secrets

- **Never** hardcode API keys, tokens, passwords, or AWS credentials in source or CloudFormation.
- Load configuration from environment variables / Secrets Manager via Nest config helpers.
- Document variables in `docs/ENVIRONMENT.md` and provide placeholders in `.env.example`.
- Store CI secrets in GitHub Actions secrets.
- Never commit `.env` files (`.env` is gitignored; Docker must not rely on baking secrets into images).
- **No dummy Anthropic/Claude API key fallbacks** on production code paths — fail fast if missing in non-dev.

---

## Logging

- Nest: use bunyan (`src/common/logger`) — not `console.log` in API code.
- Lambda: structured logging with redaction — never dump full SQS/S3/API payloads.
- **Never** log tokens, credentials, private keys, or API key material (including key prefixes).
- Include operational context (module, event id, operation) for diagnosis.

---

## Authentication (ECDSA)

Devices authenticate with headers:

- `x-device-id` — one of `pi-user`, `pi-feeder`, `pi-porch`
- `x-signature` — base64 ECDSA signature
- `x-timestamp` — ms epoch (replay window enforced)

Public keys are loaded from env (`PI_USER_PUBLIC_KEY`, `PI_FEEDER_PUBLIC_KEY`, `PI_PORCH_PUBLIC_KEY`), typically base64-encoded PEM from Secrets Manager in ECS.

### Development bypass

When **both** are true:

- `NODE_ENV=development`
- header `x-dev-mode: true`

…the ECDSA guard skips signature verification for local development.

**MUST NOT** activate unless `NODE_ENV` is exactly `development`. An unset value does not count. ECS tasks set `NODE_ENV` to `dev` or `prod`, never `development`, so the bypass stays off in both deployed environments. Do not set `x-dev-mode` on deployed clients.

---

## Database TLS

TypeORM connects to RDS over SSL and prefers verifying the AWS RDS CA (`rejectUnauthorized: true`).

In `production` / `prod`, CA verification is always on. Outside those environments, `SSL_REJECT_UNAUTHORIZED=false` is a temporary opt-out for local tunnels or diagnostics — do not rely on it in deployed stacks.

---

## AWS IAM & infrastructure

- Least privilege for ECS task roles.
- Broadening IAM or security groups requires human review.
- S3 buckets should not be public; use presigned URLs.
- Shared network resources come from `aws-infra-*` `ImportValue`s — do not hardcode subnet/SG IDs from other projects.
- Infrastructure changes live in `cloudformation/` and require human approval.

### SHOULD (follow-up)

- GitHub Actions assumes `AWS_ROLE_ARN` via OIDC. The role and provider are `cloudformation/github-actions-oidc.yaml`. Deploy that stack and set the secret before the next deploy. Workflows do not fall back to long-lived access keys.

---

## Dependencies

- New npm dependencies require human approval (`docs/GOVERNANCE.md`).
- Prefer maintained packages with clear licenses (MIT/BSD/Apache).
- Keep the root lockfile intentional — no drive-by churn.
- CI runs `npm audit --audit-level=high` as a **blocking** gate once the tree is clean.

---

## Incident response

If a secret is leaked:

1. Rotate immediately (Secrets Manager + GitHub secrets).
2. Revoke compromised device keys if applicable.
3. Audit CloudWatch logs for exposure.
4. Document the incident and follow-up fixes in the PR/issue.
