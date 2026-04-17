# Harness Hardening Proposal

## Summary

This change hardens the existing `harness` control plane so it behaves more like an enforcement layer than a command collection.

The current repo already has working `guard`, `session`, `context`, `orchestrator`, and template surfaces. The gap is not basic command presence. The gap is that policy, telemetry, caps, and auditability are still thin enough that the system can drift without being obvious.

## Why this matters

- Stage gates exist, but stage-based write permission is still implicit.
- Runtime state exists, but telemetry is not rich enough to explain what happened during a session.
- `doctor` can check installation health, but it does not yet describe the workspace in a way that helps a user decide whether to start work.
- Review and verification outcomes are recorded, but key transitions are not yet captured as a structured event stream.

## Goal

Make the harness stricter and easier to trust by adding:

- stage-bound permission profiles
- runtime telemetry counters
- caps enforcement
- a thicker `doctor`
- richer `session` / `context` surfaces
- structured event logging
- a task ledger
- regression tests for the hard constraints

## Non-goals

- Do not build a full REPL/TUI replacement.
- Do not add plugins, provider routing, or MCP lifecycle management.
- Do not rewrite the harness architecture.
- Do not do unrelated documentation cleanup outside the OpenSpec artifacts.

## Success Criteria

- The active stage maps to an explicit permission profile.
- Runtime state captures counts for tool usage, review, verification, fallback, and elapsed time.
- Caps can warn and block, not merely advise.
- `doctor` separates environment, state, workflow, and method-source issues.
- `session:status` and `context:*` show compact, useful state without opening raw files.
- Key control-plane events are persisted in a structured log.
- Tasks can be tracked as live ledger items.
- The core constraints are covered by regression tests.
