# Nest API, validation, and HTTP (API)

**Review kinds:** pr, repo
**Applies when:** any controller, DTO, pipe, filter, or `main.ts` change is in scope, and on every repo review.
**Policy:** `AGENTS.md` (NestJS), `docs/ARCHITECTURE.md`. **References:** NestJS validation docs, class-validator, OWASP API Security Top 10 (2023).

## How to review

The global pipe in `main.ts` is `whitelist`, `forbidNonWhitelisted`, and `transform`. That only protects bodies whose DTO is a class with decorators. Params, query strings, and nested objects need their own decorators. For each new or changed endpoint, write down the inputs, the DTO, the status codes, and what a hostile body can still set.

## Criteria

- **API-01** (MUST) Every body, param, and query the handler uses is a validated DTO or a pipe. A handler must not read `request.body` fields the DTO did not declare. Verify: compare the handler's reads with the DTO.
- **API-02** (MUST) Nested objects and arrays use `@ValidateNested()` and `@Type(() => Item)`. Without both, `whitelist` does not walk the children. Verify: read each nested property.
- **API-03** (MUST) String fields that become S3 keys, device ids, or model input have a max length and an allowed pattern. An unbounded string is a finding. Verify: read the decorators.
- **API-04** (SHOULD) Optional fields use `@IsOptional()` only when absence is valid, and `@ValidateIf` does not let a required field through empty. Verify: walk the DTO with the field missing and with it set to `""`.
- **API-05** (MUST) Controllers stay thin: no business logic, no SDK calls, no repository calls. Verify: read each changed method.
- **API-06** (SHOULD) Status codes match the outcome: 201 on create, 200 or 204 on update, 404 when the id does not exist, 409 on a cooldown or state conflict. Verify: read the return and the thrown exceptions.
- **API-07** (SHOULD) List endpoints are bounded (`take` or an equivalent) and do not return another device's events. Verify: read the query and the `where` clause.
- **API-08** (SHOULD) The global pipe options are not weakened, and no route opts out of validation. Verify: read `main.ts` and search `ValidationPipe`.
- **API-09** (SHOULD) Fastify limits are intentional: body size, `trustProxy` if client IP is used for rate limiting, and CORS origins come from config rather than `true` or `*`. Verify: read `main.ts` and the rate-limit guard.
- **API-10** (MUST) `api.yaml` matches the route, method, request body, and response the code actually implements. Verify: diff the operation against the controller and DTO.

## Automatic-fail signals

- A handler trusting a field that no DTO validates.
- A nested payload that skips validation.
- `api.yaml` describing a route or field the code does not have, or missing one it does.
