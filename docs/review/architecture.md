# Architecture and maintainability (ARCH)

**Review kinds:** pr, repo
**Applies when:** any new module, provider, import across packages, or layering change is in scope, and on every repo review.
**Policy:** `docs/ARCHITECTURE.md`, `AGENTS.md` (Architecture).

## How to review

The boundaries that matter here are small and easy to break: controllers stay thin, shared services are exported once, Lambda does not import Nest, and config does not leak into feature files.

## Criteria

- **ARCH-01** (MUST) Controllers do not contain business logic, SDK calls, or repository calls. Verify: read each changed controller method.
- **ARCH-02** (MUST) A shared provider is declared in one module and exported. A second `providers: [S3MetadataService]` (or any service that already has an owner) is a MUST. Verify: search the class name in `*.module.ts`.
- **ARCH-03** (MUST) Do not reintroduce a nested `lambda/` package or Nest imports that revive the photo pipeline. Verify: `lambda/` is absent (or empty by product decision) and `src/` has no photo-pipeline Lambda clients.
- **ARCH-04** (SHOULD) `src/common/types` does not import TypeORM entities. Verify: read the barrel.
- **ARCH-05** (SHOULD) New domain code lives in the module that owns it (`feed`, `detection`, `urls`, `porch`, `auth`, `health`). A new top-level module needs the human review `docs/GOVERNANCE.md` requires. Verify: read the file path.
- **ARCH-06** (SHOULD) Duplicated logic (signing, key decoding, S3 key building) is not copied a second time. The four signers must stay in lockstep but should not grow a fifth copy without a reason. Verify: search the copied block.
- **ARCH-07** (NICE) Files stay focused. A service that has grown a second responsibility is noted, not blocking.
- **ARCH-08** (SHOULD) Dead providers, unused exports, and scripts nothing calls are removed or justified. Verify: search the name.

## Automatic-fail signals

- Reintroducing a nested `lambda/` photo pipeline without an explicit product decision.
- The same provider constructed in two modules.
