# TypeScript (TS)

**Review kinds:** pr, repo
**Applies when:** any `.ts` file, `tsconfig.json`, or `tsconfig.build.json` is in scope.
**Policy:** `CONTEXT.md` (Type Safety), `AGENTS.md` (TypeScript).

## How to review

`tsconfig.json` enables `noImplicitAny`, `strictBindCallApply`, `strictPropertyInitialization`, and `noFallthroughCasesInSwitch`. Production builds use `tsconfig.build.json`, which excludes tests. Tests are typechecked separately with `tsconfig.spec.json`. ESLint errors on `any` in production code and on floating promises. A definite-assignment assertion (`!`) on a TypeORM column or a DTO field is expected, because those values are assigned by the framework. Review every other cast.

## Criteria

- **TS-01** (MUST) No new `any` in production code without a comment justifying it. Tests may use `any`. Prefer `unknown` and a narrowing check at boundaries. Verify: search `: any` and `as any` outside tests.
- **TS-02** (MUST) No assertion on untrusted data. JSON, env values, headers, and model output are validated before use, not cast with `as`. Verify: search `as` in scope and classify each one.
- **TS-03** (MUST) No floating promises. Every promise is awaited, returned, or handled, including Nest handlers that return promises. Verify: read each call to an `async` function.
- **TS-04** (SHOULD) Non-null assertions (`!`) are justified by a check the reader can see. Verify: search `!` on expressions.
- **TS-05** (SHOULD) Public service methods and controller handlers declare their return types. Verify: read the signatures.
- **TS-06** (SHOULD) Unions and enums are handled exhaustively, with a `never` check or an explicit default. Verify: read each `switch`.
- **TS-07** (MUST) Compiler options are not weakened, and `strict` flags already off are not relied on to excuse an unsafe pattern. Verify: read the `tsconfig` diff.
- **TS-08** (SHOULD) Entity nullability matches how the code reads the column. A column declared nullable is checked before use. Verify: compare the entity with the readers.
- **TS-09** (SHOULD) Shared types live in the owning module. Duplicating a type across modules is a contract to keep in sync, and it is called out. Verify: search the type name across `src/`.
- **TS-10** (NICE) Types are readable: names describe the value, and generics are used when they earn their cost. Verify: read the declarations.

## Automatic-fail signals

- `as SomeType` on data from the network, env, or the model with no validation.
- An unhandled promise in a handler, a service, or a script entry point.
- `any` added in production code with no justification.
