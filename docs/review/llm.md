# Claude and model output (LLM)

**Review kinds:** pr, repo
**Applies when:** any call to the Anthropic SDK or code that parses model output is in scope, and on every repo review.
**Policy:** `docs/SECURITY.md` (no dummy keys, no key prefixes in logs), `AGENTS.md`. Rekognition and the still-photo Sharp pipeline are removed.

## How to review

Model output is untrusted input. A count, a label, or a JSON blob from Claude must be checked before it changes a stored column or a feeder decision. Also check what is sent: images can contain text the model will follow, and logs must not contain the API key.

## Criteria

- **LLM-01** (MUST) The Claude API key is required outside development, test, and ECS `dev` and has no dummy fallback. A missing key fails the request or skips the call visibly; it does not invent a count. Verify: read the config branch and the service's missing-key path.
- **LLM-02** (MUST) The key, any key prefix, and the raw credential are never logged. Verify: read every log in the Claude service.
- **LLM-03** (MUST) Model output is validated before use: expected JSON shape, numeric ranges, and allowed labels. A parse failure is an error, not a default of "no animals" or "allow". Verify: read the parser and the branch that handles malformed output.
- **LLM-04** (SHOULD) Calls set `max_tokens`, a timeout, and a bounded retry. A hang or a 529/429 must not block the worker forever. Verify: read the SDK call options against the installed `@anthropic-ai/sdk` types.
- **LLM-05** (SHOULD) The model id comes from config (`CLAUDE_MODEL`) and an unknown or retired id fails clearly. Verify: read the default and the docs row in `docs/ENVIRONMENT.md`.
- **LLM-06** (SHOULD) Prompts do not grant the model permission to override the decision rules, and text inside an image is not treated as an instruction to the service. Verify: read the prompt text.
- **LLM-07** (SHOULD) Frames sent to Claude are bounded (count and bytes) before the call. Verify: read the feeder sampler / classify DTO limits.
- **LLM-08** (MUST) A new model provider is not added without the human approval `docs/GOVERNANCE.md` requires. Verify: read new dependencies.
- **LLM-09** (MUST) Do not reintroduce Rekognition or a Sharp still-photo pipeline without a product decision. Verify: search the diff for `rekognition`, `sharp`, `/feed`, `/detection`.

## Automatic-fail signals

- A decision taken from unparsed model text.
- A logged API key or key prefix.
- A missing key replaced with a hardcoded dummy on a production path.
