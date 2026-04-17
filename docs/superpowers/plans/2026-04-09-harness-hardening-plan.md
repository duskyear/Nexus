# Harness Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** tighten `harness` into a stricter control plane by adding stage-bound permission profiles, runtime telemetry, caps enforcement, a thicker doctor, a better session/context surface, structured event logging, a task ledger, and regression coverage.

**Architecture:** keep `guard` as the enforcement surface, keep control-plane state as the source of truth, and move shared policy/telemetry logic into small schema-backed helpers. The work should stay additive: existing stage flow and install behavior remain intact, while new state and output surfaces are layered on top and verified through focused tests.

**Tech Stack:** TypeScript, Node.js `fs/promises`, `vitest`, existing `guard` CLI, existing control-plane state store, existing harness config files.

---

## File Map

- `harness/guard.config.json`: add stage permission defaults and cap thresholds.
- `tools/guard/schema/config.ts`: extend schema for permission profiles and caps.
- `tools/control-plane/schema/runtime-context.ts`: add telemetry counters and timing fields.
- `tools/control-plane/schema/index.ts`: export any new schema files added below.
- `tools/control-plane/state/store.ts`: persist and load the richer runtime/control-plane state.
- `tools/control-plane/core/advisory.ts`: enforce cap warnings and blocks.
- `tools/control-plane/core/session.ts`: surface compact session/context summaries.
- `tools/control-plane/core/workflow.ts`: carry stage/status metadata needed by the richer outputs.
- `tools/control-plane/registry/commands.ts`: wire policy, telemetry, events, and task ledger behavior into command dispatch.
- `tools/guard/cli/run.ts`: expose the new doctor/session/context output and update state after each command.
- `tools/guard/core/types.ts`: extend `GuardResult` with structured doctor/session/context fields.
- `tools/guard/cli/index.ts`: keep JSON/text formatting aligned with the richer result shape.
- `tools/templates/core/templates.ts`: attach task ledger and review-gate guidance to generated templates.
- `tests/permission-profiles.test.ts`: permission profile coverage.
- `tests/runtime-context.test.ts`: telemetry counter coverage.
- `tests/caps-enforcement.test.ts`: cap enforcement coverage.
- `tests/doctor-flow.test.ts`: doctor 2.0 coverage.
- `tests/session-context-surface.test.ts`: session/context output coverage.
- `tests/event-log.test.ts`: structured event log coverage.
- `tests/task-ledger.test.ts`: task ledger coverage.

## Validation Method

- For each task, write the smallest failing test first and run it with `npm test -- <file>`.
- After each implementation slice, rerun the same focused test file until it passes.
- When the full plan is complete, run:
  - `npm test`
  - `npm run guard -- doctor`
  - `npm run guard -- skills --source all`

---

### Task 1: Stage-bound permission profiles

**Files:**
- Modify: `harness/guard.config.json`
- Modify: `tools/guard/schema/config.ts`
- Modify: `tools/control-plane/registry/commands.ts`
- Modify: `tools/guard/cli/run.ts`
- Test: `tests/permission-profiles.test.ts`

- [ ] **Step 1: Write the failing tests**

Create tests that prove:
- a stage can resolve to a default permission profile
- `plan`, `openspec`, and `review*` default to read-only
- `implementation` and `hardening` default to workspace-write
- a write-oriented action is blocked when the active stage maps to a read-only profile
- `guard` output includes the active permission profile

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm test -- tests/permission-profiles.test.ts`
Expected: fail because permission profile resolution and stage-based blocking are not implemented yet.

- [ ] **Step 3: Implement the smallest policy layer**

Add schema support in `tools/guard/schema/config.ts`, update `harness/guard.config.json`, and wire the resolved permission profile into command evaluation in `tools/control-plane/registry/commands.ts` and `tools/guard/cli/run.ts`.

- [ ] **Step 4: Re-run the focused test**

Run: `npm test -- tests/permission-profiles.test.ts`
Expected: pass.

---

### Task 2: Runtime telemetry and caps state

**Files:**
- Modify: `tools/control-plane/schema/runtime-context.ts`
- Modify: `tools/control-plane/schema/index.ts`
- Modify: `tools/control-plane/state/store.ts`
- Modify: `tools/control-plane/core/session.ts`
- Modify: `tools/guard/cli/run.ts`
- Test: `tests/runtime-context.test.ts`

- [ ] **Step 1: Write the failing tests**

Create tests that prove:
- runtime context can track `tool_calls_used`, `review_count`, `verification_count`, `fallback_count`, `retries_used`, and `elapsed_ms`
- the counters survive a save/load round trip
- session/context output can read the same counters from one source

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm test -- tests/runtime-context.test.ts`
Expected: fail because the runtime context schema and persistence do not yet expose these fields.

- [ ] **Step 3: Implement the minimal telemetry schema**

Extend the runtime context schema, update store read/write paths, and add helper code so the command layer can increment the counters without duplicating logic.

- [ ] **Step 4: Re-run the focused test**

Run: `npm test -- tests/runtime-context.test.ts`
Expected: pass.

---

### Task 3: Caps enforcement

**Files:**
- Modify: `harness/guard.config.json`
- Modify: `tools/guard/schema/config.ts`
- Modify: `tools/control-plane/core/advisory.ts`
- Modify: `tools/control-plane/registry/commands.ts`
- Modify: `tools/guard/cli/run.ts`
- Test: `tests/caps-enforcement.test.ts`

- [ ] **Step 1: Write the failing tests**

Create tests that prove:
- caps can be configured in the guard config
- approaching a cap returns `WARN`
- exceeding a cap returns `BLOCK`
- a multi-agent request is downgraded or blocked when cap policy says it must not proceed

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm test -- tests/caps-enforcement.test.ts`
Expected: fail because caps are not enforced yet.

- [ ] **Step 3: Implement the minimal cap check**

Add cap thresholds to config, evaluate them in advisory/policy code, and make the command layer return `WARN` or `BLOCK` instead of only advisory hints.

- [ ] **Step 4: Re-run the focused test**

Run: `npm test -- tests/caps-enforcement.test.ts`
Expected: pass.

---

### Task 4: Doctor 2.0

**Files:**
- Modify: `tools/guard/cli/run.ts`
- Modify: `tools/guard/core/types.ts`
- Test: `tests/doctor-flow.test.ts`

- [ ] **Step 1: Write the failing tests**

Create tests that prove:
- `doctor` reports separate categories for environment, state, workflow, and method-source issues
- `doctor` includes a compact summary and a list of fixable items
- `--fix` updates only method-source/install concerns and does not mutate workflow state

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm test -- tests/doctor-flow.test.ts`
Expected: fail because the doctor output is still installation-centric.

- [ ] **Step 3: Implement the minimal doctor report**

Refactor the doctor command so it builds a structured report first, then formats that report for text or JSON output. Keep fixable actions limited to method-source and local install repair.

- [ ] **Step 4: Re-run the focused test**

Run: `npm test -- tests/doctor-flow.test.ts`
Expected: pass.

---

### Task 5: Session and context surface

**Files:**
- Modify: `tools/control-plane/core/session.ts`
- Modify: `tools/control-plane/core/workflow.ts`
- Modify: `tools/control-plane/registry/commands.ts`
- Modify: `tools/guard/cli/index.ts`
- Test: `tests/session-context-surface.test.ts`

- [ ] **Step 1: Write the failing tests**

Create tests that prove:
- `session:status --compact` returns a dense human-readable summary
- `session:status --json` returns structured fields
- `context:snapshot` includes current stage, permission profile, counters, known risks, and next recommended action
- `context:summary` is readable without opening the raw `.harness/*.json` files

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm test -- tests/session-context-surface.test.ts`
Expected: fail because session/context outputs are still too thin.

- [ ] **Step 3: Implement the minimal surface expansion**

Extend the session and workflow helpers so both text and JSON views pull from the same state and include the same core facts.

- [ ] **Step 4: Re-run the focused test**

Run: `npm test -- tests/session-context-surface.test.ts`
Expected: pass.

---

### Task 6: Structured event log

**Files:**
- Create: `tools/control-plane/schema/event-log.ts`
- Modify: `tools/control-plane/schema/index.ts`
- Modify: `tools/control-plane/state/store.ts`
- Modify: `tools/control-plane/registry/commands.ts`
- Modify: `tools/guard/cli/run.ts`
- Test: `tests/event-log.test.ts`

- [ ] **Step 1: Write the failing tests**

Create tests that prove:
- stage transitions emit `stage_entered` and `stage_blocked`
- review actions emit `review_passed` and `review_failed`
- verification emits `claim_verified` and `claim_blocked`
- cap changes emit `cap_warning` and `cap_exceeded`
- the event log persists independently of the final workflow state

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm test -- tests/event-log.test.ts`
Expected: fail because structured events are not persisted yet.

- [ ] **Step 3: Implement the minimal event pipeline**

Add a small event schema, append events at the command boundary, and persist them in the control-plane store alongside the current state.

- [ ] **Step 4: Re-run the focused test**

Run: `npm test -- tests/event-log.test.ts`
Expected: pass.

---

### Task 7: Task ledger

**Files:**
- Create: `tools/control-plane/schema/task-ledger.ts`
- Modify: `tools/control-plane/schema/index.ts`
- Modify: `tools/control-plane/state/store.ts`
- Modify: `tools/control-plane/registry/commands.ts`
- Modify: `tools/templates/core/templates.ts`
- Test: `tests/task-ledger.test.ts`

- [ ] **Step 1: Write the failing tests**

Create tests that prove:
- tasks can be added, listed, marked done, and blocked
- tasks can store evidence references and notes
- verification entries can link back to a task
- templates can seed a basic task ledger without inventing new workflow concepts

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm test -- tests/task-ledger.test.ts`
Expected: fail because there is no task ledger yet.

- [ ] **Step 3: Implement the minimal task ledger**

Add a small task schema and persistence path, then expose command helpers that can mutate and read the ledger without touching unrelated workflow state.

- [ ] **Step 4: Re-run the focused test**

Run: `npm test -- tests/task-ledger.test.ts`
Expected: pass.

---

### Task 8: Regression harness for hard constraints

**Files:**
- Modify: `tests/control-plane.test.ts`
- Modify: `tests/control-plane-core.test.ts`
- Modify: `tests/control-plane-advisory.test.ts`
- Add: `tests/permission-profiles.test.ts`
- Add: `tests/runtime-context.test.ts`
- Add: `tests/caps-enforcement.test.ts`
- Add: `tests/doctor-flow.test.ts`
- Add: `tests/session-context-surface.test.ts`
- Add: `tests/event-log.test.ts`
- Add: `tests/task-ledger.test.ts`

- [ ] **Step 1: Add the regression scenarios**

Make sure the suite covers the high-value failures:
- evidence is missing but a completion claim is attempted
- placeholder ADC content cannot be recorded as complete
- read-only stages cannot trigger write-only actions
- cap limits block oversized execution modes
- attach-root cannot escape the workspace
- review failures remain failures until the workflow state changes correctly

- [ ] **Step 2: Run the focused regression files and verify they fail or pass for the right reasons**

Run: `npm test -- tests/control-plane.test.ts tests/control-plane-core.test.ts tests/control-plane-advisory.test.ts`
Expected: the added assertions should fail before implementation and pass after the earlier tasks are complete.

- [ ] **Step 3: Stabilize shared fixtures**

Consolidate repeated config/state fixtures so the regression tests remain readable and do not drift from the production config shape.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: all tests pass.

---

## Delivery Check

After the tasks above are complete, run the repo-level checks:

- `npm run guard -- doctor`
- `npm run guard -- skills --source all`
- `npm test`

Only call the work done when those commands are fresh and green.
