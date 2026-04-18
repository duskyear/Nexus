# Nexus Personal Usage Guide

`Nexus` is a local workflow enhancement layer for individual `Codex` desktop users.

Its job is not to replace `Codex`. Its job is to make `Codex` more predictable:

- less scope drift
- fewer accidental side effects
- stronger verification discipline
- cleaner handoffs between planning, implementation, and delivery

## 1. Core Principle

Use the lightest workflow that still gives you trustworthy results.

Do not start from orchestration. Start from a bounded task, then add structure only when the task shape actually needs it.

## 2. Default Workflow

### Small task

Use this when the change is isolated and obvious.

- stay in the current workspace
- use a focused task prompt
- make the smallest necessary change
- run the smallest relevant validation
- only claim completion with evidence

### Medium task

Use this when the task spans multiple files or has real ambiguity.

1. `guard stage plan`
2. `guard stage openspec`
3. implement in small batches
4. `guard stage local_run`
5. final review with fresh verification evidence

### High-risk task

Use this when the work touches architecture, public APIs, schema, major dependencies, or unrelated refactors.

- pause and state the high-risk change explicitly
- explain why it is needed
- list alternatives
- require confirmation before continuing

## 3. What To Reach For First

### Guard

Use `guard` for:

- stage transitions
- workflow checks
- verification claims
- task ledger updates
- session/context surfaces

### Local skills

Use local bundled skills first when they fit:

- `brainstorming`
- `writing-plans`
- `test-driven-development`
- `executing-plans`
- `subagent-driven-development`
- `using-git-worktrees`

### Optional upstream method sources

`superpowers` and `OMX` are optional enhancements.

Use them only when the local workflow is not enough, or when you are intentionally running inside an environment that supports their runtime features.

### Optional MCP

Use MCP only when the task truly benefits from live external tools or data.

Recommended minimum set:

- `filesystem`
- `git`
- `fetch`

Do not treat MCP as required for the normal local coding path.

## 4. No-Upstream Mode

`Nexus` should still be useful without full upstream integrations.

The local baseline is:

- `AGENTS.md` for rules
- `harness/` for stage flow and templates
- `tools/guard` for policy and command entrypoints
- `tools/control-plane` for structured state
- `skills/` for recurring local methods

If upstream method sources are missing, continue with the local path instead of treating the workflow as broken.

If MCP is missing, continue with the local path as well unless the task explicitly needs live external context.

## 5. Verification Discipline

The default standard is:

- define the claim
- run the command that proves the claim
- capture command, exit code, and summary
- prefer fresh evidence over conversational confidence

If a command is noisy or flaky, use the optional `auto-retry` wrapper when it helps preserve stderr and retry context.

## 6. Solo Codex Rules

- Do not over-specify trivial work
- Do not silently widen scope
- Do not let planning replace implementation
- Do not let implementation replace verification
- Do not let "it should work" stand in for evidence

## 6.5 Language Rule

For this repository:

- human-facing interaction with the operator should default to Chinese when the operator is using Chinese
- code, schema keys, structured outputs, and machine-facing internal contracts should stay in English unless there is a concrete reason to localize them

## 7. End State

`Nexus` is working when your daily `Codex` use feels:

- more bounded
- more verifiable
- less repetitive
- less dependent on one giant prompt
