## Summary

<!-- What does this PR do? Why? -->

## Type

- [ ] Feature (new functionality)
- [ ] Fix (bug fix)
- [ ] Refactor (code improvement, no behavior change)
- [ ] Test (adding/updating tests)
- [ ] Docs (documentation only)
- [ ] Chore (dependencies, CI, tooling)

## Checklist

### Required

- [ ] `make preflight` passes (or push validation: root + lambda quality gates)
- [ ] PR CI green (API and/or lambda workflows as applicable)
- [ ] Tests added/updated for changes
- [ ] Coverage remains ≥ 80%
- [ ] No new lint/format violations

### Architecture

- [ ] Nest module boundaries respected (controllers thin; shared providers exported)
- [ ] Lambda package isolation preserved (no Nest ↔ Lambda source imports)
- [ ] Config/env changes documented (`.env.example` + `docs/ENVIRONMENT.md`)
- [ ] CloudFormation uses `aws-infra-*` ImportValues when touching networking

### Security

- [ ] No hardcoded secrets
- [ ] No sensitive data / API key material in logs
- [ ] ECDSA prod bypass not introduced

## Review Notes

<!-- Anything reviewers should focus on? -->
