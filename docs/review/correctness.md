# Logic and correctness (COR)

**Review kinds:** pr, repo
**Applies when:** any source, script, workflow, Lambda, or Python logic is in scope.
**Policy:** `AGENTS.md`, `docs/ARCHITECTURE.md`.

## How to review

For each changed function, guard branch, service method, script step, or workflow expression, write down its inputs (DTO fields, headers, env, S3 keys, SQS bodies, model output, CLI args) and walk each branch with normal, empty, boundary, and invalid values. Compare old and new behavior line by line. Read the whole file, not the hunk: most logic bugs live in the interaction between changed and unchanged lines.

Status workflows deserve extra care. Feed and detection events move through named states; a transition that skips, repeats, or gets stuck is a correctness bug even when every line looks locally fine.

## Criteria

- **COR-01** (MUST) Conditions are correct: comparison direction, negation, `&&`/`||`/`??` precedence, and no flipped literals or operators. Verify: re-derive each changed condition from the intended behavior.
- **COR-02** (MUST) Boundaries are handled: empty arrays, zero, negative numbers, maximum sizes, off-by-one in slices and loops, and the first and last item. Verify: walk each loop or slice with 0, 1, and n items.
- **COR-03** (MUST) Absent and invalid values are handled where they can occur: missing env, missing DTO fields, `NaN` from `parseInt`, invalid dates, empty S3 bodies. Verify: trace each value to its source and confirm the missing case.
- **COR-04** (SHOULD) Time logic is correct: units match (ms vs s vs hours), cooldown windows use one clock, and expiry comparisons agree with the value they are compared to. Verify: read every `Date`, `Date.now`, and duration constant in scope.
- **COR-05** (MUST) Control flow is intended: early returns, fall-through, unreachable code, and removed branches do not strand a status or a caller. Verify: trace every exit of each changed function, including the status it leaves behind.
- **COR-06** (SHOULD) Strings and keys are built correctly: S3 prefixes, URL paths, query encoding, and template literals. A missing slash or an extra slash changes which objects a prefix matches. Verify: evaluate the built string for normal and edge inputs.
- **COR-07** (SHOULD) Ordering assumptions are explicit and enforced, and comparators are correct. Verify: find where order is produced and where it is relied on.
- **COR-08** (SHOULD) Fallbacks do not hide wrong inputs. `||` is not used where `??` is needed, because `0` and `''` can be valid. Verify: list each fallback and the inputs that trigger it.
- **COR-09** (MUST) State machines are valid: every status can be reached only from the statuses that should precede it, retries do not double-apply a side effect, and a failure leaves a status that can be recovered. Verify: enumerate the transitions.
- **COR-10** (SHOULD) Re-running is safe: handlers, scripts, and workflow steps behave correctly when run twice or retried. Verify: reason through a second run with the state left by the first.
- **COR-11** (MUST) The change does what the PR or commit says and nothing it does not say. Verify: compare the description and commit messages with the full diff.

## Automatic-fail signals

- A condition whose truth table contradicts the stated intent.
- A status transition that can skip a required step or apply a side effect twice.
