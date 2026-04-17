# POCKET_GUIDE.md

## 1. Purpose

This is the one-minute entry guide.

Use it to answer:

- what stage am I in
- what file should I read next
- which skill probably triggers first
- does this task really need orchestration

## 2. Default Path

```text
Plan
-> OpenSpec
-> Review Gate 1
-> Implementation
-> Review Gate 2
-> Validation / Runtime Check
-> Review Gate 3
-> Production hardening
```

Default execution mode:

- simple -> `single-agent`
- medium -> `role-based single-agent`
- only approved + independently splittable + lower context pollution -> `multi-agent`
- `OpenSpec` is a stage goal; use a lightweight spec artifact when the task is small
- consider the external OpenSpec skill for medium or large tasks, multi-file changes, or when a fuller artifact set would reduce rework

## 3. What To Read Next

- Need the full stage flow: `HARNESS_WORKFLOW.md`
- Need review criteria: `REVIEW_GATE_CHECKLIST.md`
- Need reusable prompt text: `PROMPT_TEMPLATES.md`
- Need execution mode / context / fallback design: `AGENT_DESIGN_CARD.md`
- Need external method source setup: `integrations.md`
- Need a step-by-step machine setup flow: `integration-checklist.md`

## 4. Skill Triggers

```text
bug / test fail / build fail / unexpected behavior
-> systematic-debugging

behavior change / feature work / bug fix
-> test-driven-development

about to claim complete / fixed / passing / ready
-> verification-before-completion

written plan + truly independent subtasks
-> consider subagent-driven-development
```

## 5. Workflow Sources

- Local bundled skills in `skills/` are the first source for method guidance.
- Upstream `superpowers` adds broader planning, review, debugging, and completion skills when the local bundle does not cover the need.
- Upstream `oh-my-codex` adds runtime/workflow guidance for clarification, planning, coordination, and completion loops.
- Skills guide how to work; harness stages decide when work is allowed.

## 6. External Setup

For the full experience on a new machine:

- make sure the machine can access the upstream `superpowers` skill library
- make sure the machine can access the upstream `oh-my-codex` workflow layer
- verify upstream access before relying on upstream-only methods
- if either one is missing, keep working with the local bundled `skills/` subset and treat the gap as a reduced-capability environment, not a failed harness
- when missing, the correct response is an install/update hint, not a blocked control plane unless the current task truly depends on that upstream method

## 7. Three Hard Rules

- No validation, no completion claim.
- Do not silently expand scope.
- Stop before high-risk changes and ask for confirmation.

High-risk changes:

- adding major dependencies
- changing architecture significantly
- changing database schema
- changing public APIs
- unrelated cleanup or refactors

## 8. Shortest Usable Script

```text
Decide execution mode first.
Do not default to multi-agent.
Plan before medium or high-risk work.
OpenSpec before implementation.
Pass Review Gate 1 before writing code.
Implement in small validated batches.
Run Review Gate 2 if drift appears.
Prove the code runs.
Run Review Gate 3 before claiming done.
Only then move to production hardening.
```
