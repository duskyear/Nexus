# Harness Hardening Specification

## Behavioral Requirements

### Permission Profiles

- Each stage must resolve to a default permission profile.
- `plan`, `openspec`, and `review` stages must default to read-only behavior.
- `implementation` and `hardening` must allow workspace write behavior by default.
- High-risk actions must be blocked when the active profile does not allow them.

### Runtime Telemetry

- The control plane must track counts for tool calls, reviews, verifications, retries, and fallback usage.
- Elapsed time for the active session or stage must be captured.
- The telemetry must persist across save/load cycles.

### Caps

- Caps must be evaluated as policy.
- A warning threshold must produce a warning.
- An over-limit condition must block the action.
- Caps must be visible in the runtime-facing outputs.

### Doctor

- `doctor` must distinguish between environment, state, workflow, and method-source failures.
- `doctor` must return a summary and a list of fixable items.
- `doctor --fix` must only repair install/method-source concerns.

### Session and Context

- `session:status` must support compact and JSON output.
- `context:snapshot` must include current stage, permission profile, telemetry, risks, and next recommended action.
- `context:summary` must be readable without opening raw state files.

### Event Log

- Control-plane transitions must be recorded as structured events.
- Event log entries must persist independently of the final workflow state.

### Task Ledger

- Tasks must be first-class tracked items.
- Verification evidence should be attachable to tasks.
- The task ledger must support add, list, done, and block behaviors.

### Regression Coverage

- Evidence gaps must block completion claims.
- Placeholder ADC content must not pass validation.
- Read-only stages must not permit write-only actions.
- Caps must block over-limit execution.
- Workspace boundary checks must prevent out-of-tree roots.

## Compatibility Notes

- Existing stage flow and command names should remain stable.
- The split state files under `.harness/` should remain the persistence source of truth.
- Legacy `.harness-state.json` compatibility should be preserved until the workflow fully migrates.
