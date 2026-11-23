# Secrets, injection, and trust boundaries (SEC)

**Review kinds:** pr, repo
**Applies when:** always. These criteria apply to every file type, including docs, tests, workflows, Python, and shell.
**Policy:** `docs/SECURITY.md`, `CONTEXT.md` (Secrets). **Procedure:** the `security-review` skill.
**References:** OWASP Top 10:2025 (A03 Software Supply Chain Failures, A05 Injection, A10 Mishandling of Exceptional Conditions), OWASP ASVS 5.0.

Authentication checks are in [auth.md](auth.md), database queries in [database.md](database.md), model calls in [llm.md](llm.md), S3 and images in [aws.md](aws.md), and workflow security in [ci-cd.md](ci-cd.md).

## How to review

Start from the trust boundaries. Data enters from devices (images, metadata, signatures), from the public clip list's callers, from env and Secrets Manager, from S3 events, and from model output. For each changed line, ask whether untrusted data reaches a sink (SQL, shell, file path, S3 key, log, HTML, prompt) and whether secret material can reach logs, images, artifacts, or the repo.

Run the searches below and record their output. A search is a heuristic; still read every changed file in full.

```bash
rg -n "AKIA[0-9A-Z]{16}|-----BEGIN|sk-ant-|api[_-]?key\\s*[:=]\\s*['\\\"][^'\\\"]+['\\\"]" -g '!node_modules' -g '!dist' -g '!certs'
rg -n "console\\.(log|debug|info|error)|logger\\.(info|debug|error|warn)" -g '!*.spec.ts' -g '!*.test.ts'
```

## Criteria

- **SEC-01** (MUST) No secrets in source, tests, fixtures, docs, workflows, lockfiles, or images. Verify: the searches above plus reading every changed file.
- **SEC-02** (MUST) No `.env*` file other than the examples is tracked. The only tracked PEM is the public RDS CA bundle under `certs/`. Verify: `git ls-files | rg -n '\\.pem$|(^|/)\\.env(\\.|$)'`.
- **SEC-03** (MUST) Private keys are loaded from env or a file path outside the repo, never logged, never returned, and never written beside the code. Verify: read every use of `PRIVATE_KEY`, `CLAUDE_API_KEY`, and `RDS_PASSWORD`.
- **SEC-04** (MUST) Logs do not contain tokens, signatures, keys, key prefixes, passwords, presigned URLs, or raw image bytes. Verify: read every log call and logged object in scope.
- **SEC-05** (MUST) No command injection: shell commands and `child_process` calls use argument arrays, and no string built from input reaches a shell. Verify: search `exec(`, `execSync(`, `spawn(`, `shell:`, and shell scripts for unquoted variables.
- **SEC-06** (MUST) No path traversal: file paths and S3 keys built from input stay inside the intended directory or prefix. Verify: trace each key or path to its inputs.
- **SEC-07** (SHOULD) Dependencies on security-sensitive behavior are pinned to the behavior, not assumed: signature encoding, hash algorithm, and header names are explicit in code. Verify: read the call rather than the library's defaults.
- **SEC-08** (MUST) No new trust boundary (a new public route, a new device id, a new secret channel, a new third-party service) without the human review `docs/GOVERNANCE.md` requires. Verify: compare new routes, env vars, and dependencies with the governance lists.
- **SEC-09** (SHOULD) Test fixtures and seed data contain no real secrets and no production identifiers. Verify: read fixtures and `scripts/db-seed`.
- **SEC-10** (SHOULD) Security-relevant changes include a regression test or a recorded manual check. Verify: read the tests and the PR description.

## Automatic-fail signals

- A secret value, private key, or token anywhere in the tree.
- Untrusted data reaching a shell, a file path, or an S3 key without validation.
- A log statement that prints a key, token, signature, or presigned URL.
