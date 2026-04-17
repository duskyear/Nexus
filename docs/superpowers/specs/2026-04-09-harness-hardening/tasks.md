# Harness Hardening Tasks

## Task 1: Permission profiles

- Add stage-to-permission defaults to `harness/guard.config.json`.
- Extend the guard config schema for permission profiles.
- Route high-risk actions through a shared policy check.
- Add tests that prove read-only stages cannot trigger write-only actions.

## Task 2: Runtime telemetry

- Extend `runtime-context` with counters and elapsed time.
- Persist the new runtime state in the control-plane store.
- Update session/context helpers to read from the same state.
- Add tests for save/load round-tripping.

## Task 3: Caps enforcement

- Add cap thresholds to config.
- Evaluate caps at the policy layer.
- Return `WARN` near thresholds and `BLOCK` past them.
- Add tests for cap-based blocking and downgrade behavior.

## Task 4: Doctor 2.0

- Refactor `doctor` to build a structured report first.
- Separate environment, state, workflow, and method-source findings.
- Expose compact summary and fixable items.
- Add tests for report shape and fix scope.

## Task 5: Session/context surface

- Expand `session:status` with compact and JSON output.
- Expand `context:snapshot` with counters, risks, and next action.
- Keep the text and JSON views backed by the same state.
- Add tests for both output forms.

## Task 6: Event log

- Add a structured event schema.
- Append control-plane events at the command boundary.
- Persist the event log with the rest of the control-plane state.
- Add tests that assert important transitions are recorded.

## Task 7: Task ledger

- Add a task schema and persistence path.
- Expose task add/list/update helpers.
- Link verification evidence to tasks.
- Add tests for task lifecycle behavior.

## Task 8: Regression harness

- Extend the existing control-plane tests with high-value failures.
- Add focused tests for each new subsystem.
- Keep fixtures aligned with the production config shape.
- Run the full suite and repo-level checks at the end.
