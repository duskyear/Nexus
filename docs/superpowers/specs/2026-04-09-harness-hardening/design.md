# Harness Hardening Design

## Architecture

The design keeps `guard` as the enforcement surface and uses the control-plane store as the source of truth for workflow state, session context, runtime telemetry, and evidence.

Policy should live in small reusable helpers instead of being embedded in command handlers. Output formatting can remain command-specific, but the data that powers it should come from shared schema-backed state.

The plan is intentionally additive:

- keep existing stage flow intact
- add richer state and policy objects
- persist structured records alongside the existing workflow files
- keep the current commands working while enriching their outputs

## Core Components

### Permission Profiles

Stages resolve to default permission profiles.

Recommended defaults:

- `plan`, `openspec`, `review1`, `review2`, `review3` -> `read-only`
- `implementation`, `local_run`, `hardening` -> `workspace-write`

High-risk actions should check the resolved profile before they proceed.

### Runtime Telemetry

The runtime context should track:

- tool calls
- review count
- verification count
- fallback count
- retries
- elapsed time
- cap warnings
- cap blocks

These counters should be persisted centrally so `doctor`, `session:status`, and `context:snapshot` can all read the same source.

### Caps Enforcement

Caps should be treated as policy, not advisory text.

- near threshold -> `WARN`
- over threshold -> `BLOCK`

Caps should be evaluated at the control-plane boundary so command handlers do not need to duplicate the logic.

### Doctor 2.0

`doctor` should report:

- environment issues
- state issues
- workflow issues
- method-source issues

It should also expose a compact summary and a list of items that can be repaired automatically.

### Session / Context Surface

The human-readable surfaces should answer:

- What stage is active?
- What permission profile is active?
- What has been used so far?
- What is risky?
- What should happen next?

JSON output should expose the same facts without requiring users to inspect `.harness/*.json` files manually.

### Event Log

Important transitions should be appended as structured events rather than inferred later from final state.

Events should include:

- stage entered / blocked
- review passed / failed
- claim verified / blocked
- cap warning / exceeded

### Task Ledger

Tasks should be tracked as first-class items with:

- id
- title
- status
- owner mode
- evidence references
- notes

The ledger should integrate with verification, not sit beside it.

## Data Flow

1. A guard or control-plane command runs.
2. The command resolves current workflow state and permission profile.
3. The command updates telemetry, events, and evidence as needed.
4. The command persists the updated control-plane state.
5. The command emits a text or JSON result that reads from the same state.

## Risks

- The current state model has legacy compatibility paths, so schema changes need to stay backward-compatible.
- The repo already has separate legacy and split-state files, so changes must avoid double-writing inconsistent data.
- `doctor --fix` must stay narrow or it will become a hidden workflow mutator.

## Validation

Every component should be backed by focused tests before the full suite is run.

The final validation set is:

- `npm test`
- `npm run guard -- doctor`
- `npm run guard -- skills --source all`
