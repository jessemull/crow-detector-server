# ECDSA device authentication (AUTH)

**Review kinds:** pr, repo
**Applies when:** any route, guard, signer, device id, or public key is in scope, and on every repo review.
**Policy:** `docs/SECURITY.md` (Authentication), `AGENTS.md` (Auth).

## How to review

Device auth is a signature over a canonical string, not a session. Read the guard and every signer together: `src/auth/middleware/ecdsa-auth.guard.ts`, `lambda/src/util/auth.ts`, `pi/record_on_motion_lib.py`, and `scripts/generate-auth-token.ts`. A change to one that the others do not match fails closed for legitimate devices or, worse, accepts a string an attacker can forge.

Then list every controller method and say which guard covers it. A new route with no guard is public.

## Criteria

- **AUTH-01** (MUST) The dev bypass runs only when `NODE_ENV` is exactly `development` and `x-dev-mode` is exactly `true`. `production`, `prod`, `test`, and an unset value never skip verification. Verify: read the condition and the tests that set `NODE_ENV=production`.
- **AUTH-02** (MUST) Every non-public route uses `EcdsaAuthGuard`. The porch clip list is the known public route and must stay behind its rate-limit guard. Verify: list each method in each controller and the guard on it.
- **AUTH-03** (MUST) The signed string is the same in the guard and every signer: method, the URL the guard reads (`request.url`, including any query), `JSON.stringify` of the parsed body, and the timestamp, with no extra separators. Verify: compare the four builders character for character, including key order of the JSON.
- **AUTH-04** (MUST) Unknown devices and missing or malformed keys are rejected. A missing public key is not treated as "no signature required". Verify: read the lookup and the decode path for an empty or non-PEM value.
- **AUTH-05** (MUST) The replay window is enforced on both sides of now, uses one unit (epoch milliseconds), and rejects a non-numeric timestamp. Verify: read the comparison and try a timestamp of `NaN` in your head.
- **AUTH-06** (SHOULD) Verification does not throw on attacker-controlled input, and a failed verify returns 401 without the key, the signed string, or the error detail. Verify: read the `catch` and the exception messages.
- **AUTH-07** (SHOULD) There is no second auth shortcut: no header, query flag, or env var besides the documented dev bypass skips the guard. Verify: search `return true` and `x-dev-mode` in `src/`.
- **AUTH-08** (MUST) Private keys stay in env, Secrets Manager, or an untracked path. They are not logged, returned, or committed. Verify: search `PRIVATE_KEY` and read each log near a signing call.
- **AUTH-09** (SHOULD) Adding a device id updates the guard's key map, `docs/ENVIRONMENT.md`, `.env.example`, the Lambda or Pi signer, and `docs/DEVICES.md` together. Verify: search the new id.

## Automatic-fail signals

- A bypass whose condition is true when `NODE_ENV` is `production` or `prod`.
- A state-changing route with no guard.
- Two signers building different strings.
