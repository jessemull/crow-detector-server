---
name: security-review
description: >-
  Security audit for Crow Detector Server: secrets, ECDSA, IAM, logging,
  dependencies, and network exposure. Use when reviewing security-sensitive
  changes or running a security pass.
---

# Security Review

Read: `docs/SECURITY.md`, `docs/review/security.md`, `docs/review/auth.md`, and `CONTEXT.md` escalation rules.

Security-sensitive changes require human review. The criteria files are the checklist; this skill adds the searches. A search is a heuristic, so read every changed file as well.

---

## Checklist

### Secrets

- [ ] No hardcoded credentials/tokens in source or CloudFormation
- [ ] `.env` not committed; `.env.example` has placeholders only
- [ ] No dummy Claude key fallbacks on prod paths
- [ ] New secrets documented and loaded via config/env

### Logging

- [ ] No secrets/API key prefixes in bunyan or Lambda logs
- [ ] No full SQS/S3 payload dumps

### Auth

- [ ] ECDSA prod bypass impossible
- [ ] Replay window still enforced

### AWS / IAM

- [ ] Least-privilege task/lambda roles
- [ ] No overly broad `*` permissions added without justification
- [ ] S3 not unintentionally public
- [ ] CFN uses `aws-infra-*` ImportValues

### Dependencies

- [ ] New packages justified and approved
- [ ] Lockfiles updated intentionally
- [ ] `npm audit --audit-level=high` clean (root + lambda)
