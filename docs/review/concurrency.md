# Races, cooldown, and ordering (CONC)

**Review kinds:** pr, repo
**Applies when:** any status transition, cooldown, timer, queue, or shared in-memory state is in scope, and on every repo review.

## How to review

Two Lambda invocations and a device can touch the same event. In-memory rate limits and cooldown clocks are per process, and ECS runs more than one task only if the service says so; do not assume a single process unless the task count is 1.

## Criteria

- **CONC-01** (MUST) A feed or detection transition is conditional on the current status, so two workers cannot both dispense, both count, or both complete. Verify: read the update's `where`.
- **CONC-02** (MUST) Cooldown uses one clock and one unit, and a retry of the same event does not start a second cooldown. Verify: read the cooldown read and write.
- **CONC-03** (SHOULD) In-memory guards and caches are safe for concurrent requests on one task and are documented as not shared across tasks. Verify: read the structure and the service's desired count.
- **CONC-04** (SHOULD) Async work started inside a request is awaited or handed to a bounded queue. A floating task that outlives the request is a finding. Verify: read each `async` call not awaited.
- **CONC-05** (SHOULD) The porch recorder's motion window, pre-roll, and post-roll cannot overlap two uploads of the same segment. Verify: read the segment state machine in `pi/`.

## Automatic-fail signals

- A status write that does not check the current status.
- A cooldown that can be applied twice for one event.
