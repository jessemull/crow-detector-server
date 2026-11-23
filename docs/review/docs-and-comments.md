# Docs, comments, and clarity (DOC)

**Review kinds:** pr, repo
**Applies when:** always.
**Policy:** `docs/COMMENTS.md`, `CONTEXT.md` precedence.

## How to review

A comment or doc that survived a code change is the most common lie in this repo. For every changed function, re-read the comments in and above it. Then search docs, rules, and skills for the names, commands, and env vars the change touched.

## Criteria

- **DOC-01** (MUST) Comments in and next to changed code are still true. A comment that describes a bypass, a timeout, or a status the code no longer implements is a MUST when a reader would rely on it for a security decision, otherwise SHOULD. Verify: read each comment in the changed hunks and the block above them.
- **DOC-02** (MUST) `CONTEXT.md`, `AGENTS.md`, `docs/*.md`, and `api.yaml` agree with the code on routes, env names, defaults, status codes, and commands. Verify: search the changed names.
- **DOC-03** (SHOULD) `.cursor/rules` and `.cursor/skills` do not restate a rule that the docs have since changed. Verify: search the changed phrase in `.cursor/`.
- **DOC-04** (SHOULD) Comments explain why, follow the spacing rules in `docs/COMMENTS.md`, and do not narrate the next line. Verify: read new comments.
- **DOC-05** (SHOULD) `TODO` and `FIXME` name a follow-up. A TODO whose work is already done is removed. Verify: search `TODO` and `FIXME` in scope.
- **DOC-06** (SHOULD) User-facing error strings match the failure. "Unknown device" is not returned for a bad signature, and the reverse. Verify: read the exception messages.
- **DOC-07** (NICE) README device sections that `docs/DEVICES.md` supersedes are not updated back into conflict. Verify: when both describe hardware, `docs/DEVICES.md` wins.

## Automatic-fail signals

- A security-sensitive comment that contradicts the code.
- A doc and the code naming different env vars or routes for the same feature.
