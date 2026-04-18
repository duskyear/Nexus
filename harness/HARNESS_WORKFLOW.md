# HARNESS_WORKFLOW.md

## 1. Purpose

This file is the single source of truth for the stage flow.

It is an execution harness for engineering tasks, not a full SDLC template.

It answers:

- what stage the project is in
- what each stage is for
- when a stage may begin
- when a stage may end
- what must not happen in that stage

Related documents:

- use `REVIEW_GATE_CHECKLIST.md` for review criteria
- use `PROMPT_TEMPLATES.md` for reusable prompt text
- use `AGENT_DESIGN_CARD.md` when deciding whether complex agent orchestration is justified
- use `POCKET_GUIDE.md` for the short everyday entry path
- use `integrations.md` for external method source setup and verification

## 2. Global Order

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

Execution mode must be decided before planning or implementation:

- `single-agent`
- `role-based single-agent`
- `multi-agent`

Default policy:

- default to `single-agent`
- prefer `role-based single-agent` for medium-complexity work
- use `multi-agent` only after plan approval, with independent subtasks and lower context pollution
- if `multi-agent` is being considered, complete `AGENT_DESIGN_CARD.md`
- keep `OpenSpec` as a stage goal, not a required external tool call

Skill routing order:

- bug, failure, or unexpected behavior: `systematic-debugging` first
- behavior change or bug fix: `test-driven-development` by default
- completion claim or readiness claim: `verification-before-completion` first

Skill source order:

- local bundled skills under `skills/` are the first method library to check
- upstream `superpowers` fills in planning, review, debugging, and completion methods that are not bundled locally
- upstream `oh-my-codex` fills in broader Codex workflow and orchestration methods when the task benefits from them
- skills are recommendations, not stage transitions

Behavioral rules across all stages:

- think before coding: surface assumptions and ambiguity instead of silently choosing
- simplicity first: prefer the smallest process and the smallest implementation that still solves the task
- surgical changes: do not edit unrelated code, comments, or formatting
- goal-driven execution: define success criteria and verify against fresh evidence

External method prerequisites:

- For the full cross-machine workflow, the current machine should have access to the upstream `superpowers` skill library and the upstream `oh-my-codex` workflow layer.
- Treat those as environment prerequisites, not as core harness dependencies.
- Verify them before relying on upstream-only methods.
- If they are missing, keep using the local bundled `skills/` subset and continue the harness workflow; do not block core stage gates unless a task explicitly depends on the upstream method.
- When missing, report the gap as a capability reduction and give an actionable install/update hint instead of failing the whole harness.

## 2.5 Stage Skill Alignment

Use the smallest skill set that makes the current stage unambiguous:

| Stage | Local skills in this repo | External reference skills |
| --- | --- | --- |
| Plan | `brainstorming`, `writing-plans` | `deep-interview`, `ralplan`, `using-superpowers` |
| OpenSpec | `writing-plans` | `verification-before-completion` |
| Review Gate 1 | `writing-plans` | `verification-before-completion` |
| Implementation | `using-git-worktrees`, `executing-plans`, `test-driven-development`, `subagent-driven-development` | `requesting-code-review`, `receiving-code-review`, `dispatching-parallel-agents`, `systematic-debugging`, `team`, `ralph` |
| Review Gate 2 | `test-driven-development`, `systematic-debugging` | `requesting-code-review`, `receiving-code-review` |
| Validation / Runtime Check | `test-driven-development` | `verification-before-completion` |
| Review Gate 3 | `executing-plans`, `test-driven-development` | `verification-before-completion`, `finishing-a-development-branch` |
| Production hardening | `systematic-debugging` | `verification-before-completion` |

## 3. Stage 1: Plan

Purpose:

- turn a request into an executable contract

Required outputs:

- objective
- scope
- non-scope
- acceptance criteria
- task breakdown
- risks / open questions
- relevant files
- validation method
- chosen execution mode

Enter when:

- the task is medium or large
- the task is ambiguous
- the task is high-risk
- the task spans multiple files or decisions

Exit when:

- the implementation contract is explicit enough to execute without guessing

Do not:

- start implementation
- omit `non-scope`
- omit acceptance criteria
- silently choose unresolved product decisions

## 4. Stage 2: OpenSpec

Purpose:

- convert the approved plan into reviewable spec artifacts

OpenSpec is a stage goal, not a tool binding. Use the smallest artifact set that makes the next review gate and implementation path unambiguous.

If the task is medium or large, spans multiple files or modules, or would benefit from a fuller artifact set, an external OpenSpec skill may be used as an aid. It remains optional.

Expected artifacts:

- `proposal.md`
- `specs/`
- `design.md`
- `tasks.md`

Enter when:

- the plan has been reviewed and approved

Exit when:

- the OpenSpec artifacts are generated and ready for review

Do not:

- skip `design.md`
- jump directly from plan to implementation
- write unresolved assumptions as settled facts

If agent orchestration matters, `design.md` should include:

- roles
- coordination / handoff
- memory / context flow
- failure / fallback strategy

## 5. Stage 3: Review Gate 1

Purpose:

- decide whether implementation is allowed to start

Use:

- `REVIEW_GATE_CHECKLIST.md` section for the first review gate

Enter when:

- OpenSpec artifacts exist

Exit when:

- implementation is approved
- or blocking issues are listed explicitly

Do not:

- implement during review
- replace a clear conclusion with vague approval

## 6. Stage 4: Implementation

Purpose:

- implement in small, validated batches

Required operating rules:

- work on one task or one small batch at a time
- do the smallest relevant validation after each batch
- no silent scope expansion
- no unrelated cleanup or refactor
- no completion claim without fresh evidence

Execution mode rules in this stage:

- small / isolated / low-risk -> `single-agent`
- medium complexity -> `role-based single-agent`
- approved plan + independent subtasks + lower context pollution -> `multi-agent`
- `multi-agent` is not the default upgrade path

If `multi-agent` is used, define via `AGENT_DESIGN_CARD.md`:

- lead responsibility
- worker responsibility
- context strategy
- tool boundary
- budget caps
- HITL checkpoints
- fallback path
- stop conditions

Use this fixed progress format:

1. current task
2. files changed
3. validation run
4. result
5. remaining risks / next step

## 7. Stage 5: Review Gate 2

Purpose:

- detect drift before it becomes rework

Recommended triggers:

- around 30% to 70% progress
- first major blocker
- visible scope creep
- visible design drift
- repeated "while I'm here" edits

Use:

- `REVIEW_GATE_CHECKLIST.md` section for the second review gate

Exit with one of:

- continue
- correct course
- stop for confirmation

Do not:

- continue implementation under the cover of "review"
- ignore scope drift
- ignore context pollution if orchestration was enabled

## 8. Stage 6: Local Run / Environment Validation

Purpose:

- move from "code exists" to "the current scope can run or be verified"

Main tasks:

- identify the project runtime shape
- establish the local environment
- install dependencies if needed
- run the core path
- verify the relevant interface, input/output, or integration boundary
- summarize the runtime and validation result only within current scope

Enter when:

- the core implementation is largely in place

Exit when:

- the current scope runs or validates locally
- the core flow has at least basic validation
- the scope-bound runtime result is clearly summarized

Do not:

- use environment setup as a reason to keep changing product scope
- pull production hardening work into this stage

## 9. Stage 7: Review Gate 3

Purpose:

- decide whether the work is actually complete enough to deliver

Use:

- `REVIEW_GATE_CHECKLIST.md` section for the final review gate

Enter when:

- implementation exists
- local run or equivalent validation exists
- basic verification has been executed

Exit with one of:

- deliverable
- conditionally deliverable
- not deliverable

Do not:

- treat "it starts" as "it is done"
- treat theory as evidence
- continue building new functionality during review

## 10. Stage 8: Production Hardening

Purpose:

- address engineering concerns after functional delivery is mostly settled

This stage is optional and happens only after Review Gate 3 says the work is at least conditionally deliverable.

Typical scope:

- stability
- auth
- deployment
- logging
- monitoring
- configuration management
- security policy
- rate limiting

Enter when:

- Review Gate 3 says the work is at least conditionally deliverable

Exit when:

- remaining concerns are framed as hardening work rather than unfinished feature work

Do not:

- restart broad feature development in this stage
- pretend hardening work is a substitute for unfinished core behavior
