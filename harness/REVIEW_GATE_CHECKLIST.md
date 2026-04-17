# REVIEW_GATE_CHECKLIST.md

## 1. Purpose

This file is the single source of truth for review gates.

It answers:

- what to review before implementation
- what to review mid-flight
- what to review before delivery
- what counts as pass or fail
- when execution mode should be downgraded

## 2. Global Review Rules

Always:

- stop implementing while reviewing
- be explicit about findings and conclusions
- classify risks instead of speaking vaguely
- check whether the task should have triggered a workflow skill
- refuse completion claims without fresh verification evidence

Common fail signals:

- unclear objective
- unclear scope
- missing non-scope
- acceptance criteria that are not objectively checkable
- design changed without explicit approval
- scope drift
- no real validation evidence
- task was simple but orchestration was unnecessarily upgraded
- `multi-agent` has no tool boundary, no caps, or no fallback
- coordination cost is higher than the benefit

Skill routing expectations:

- prefer the local bundled skills under `skills/` first when they fit the task
- reach for upstream `superpowers` / `oh-my-codex` reference skills when the local bundle does not cover the needed method
- skills are guidance for execution, not persisted state or gate logic

Always stop for confirmation if work would:

- add major dependencies
- change architecture significantly
- change database schema
- change public APIs
- include unrelated cleanup or refactors

## 3. Gate 1: Pre-Implementation Review

Goal:

- decide whether implementation may begin

Inputs:

- OpenSpec artifacts
- plan / requirements / tasks
- acceptance criteria
- constraints

Check:

- task objective is clear
- scope and non-scope are clear
- design is coherent and implementable
- tasks cover the real implementation path
- acceptance criteria are testable
- unresolved decisions are explicit
- workflow skill routing is correct
- execution mode decision is justified
- if planning is still fuzzy, `deep-interview` or `brainstorming` should be in play before implementation starts

If agent orchestration is in scope, also check:

- does the task really need more than `single-agent`
- if not `single-agent`, why is `role-based single-agent` insufficient
- if `multi-agent`, is `AGENT_DESIGN_CARD.md` complete
- are subtask boundaries genuinely independent
- are context strategy, tool boundary, caps, HITL, and fallback explicit

Pass when:

- objective, scope, non-scope, and validation are explicit
- design is implementable
- task order is executable
- open risks are either resolved or deliberately parked for confirmation

Fail when any of these apply:

- objective and spec do not align
- scope is still ambiguous
- non-scope is missing
- task order is obviously wrong
- acceptance criteria cannot be checked
- key unresolved decisions are still implicit

Output structure:

- task goal
- scope review
- design review
- task breakdown review
- acceptance review
- open questions
- major risks
- execution mode review
- conclusion

## 4. Gate 2: Mid-Implementation Review

Goal:

- detect drift, waste, and orchestration failure before they harden

Inputs:

- current code state
- current task progress
- original OpenSpec artifacts

Check:

- current work still serves the original goal
- no silent scope creep
- no design substitution without approval
- blockers and new risks are explicit
- debugging / TDD flow was not skipped where it should have been used
- implementation work should still map cleanly to `using-git-worktrees`, `executing-plans`, `test-driven-development`, or `systematic-debugging` as appropriate

If orchestration is active, also check:

- context pollution
- duplicated work
- overlapping agent responsibilities
- cap overruns
- coordination cost versus value
- whether the work should be downgraded to `role-based single-agent` or `single-agent`

Pass when:

- work is still aligned to goal and scope
- there is no material drift
- blockers are controlled
- orchestration, if used, is still earning its cost

Fail when:

- the task is drifting
- scope is expanding without approval
- design was silently changed
- new blockers materially affect the plan
- orchestration is creating more overhead than value

Output structure:

- current progress
- goal alignment
- scope control
- design consistency
- blockers and risks
- orchestration health
- recommended next action

## 5. Gate 3: Delivery Review

Goal:

- decide whether the work is actually ready to claim as complete or deliverable

Inputs:

- OpenSpec artifacts
- implemented code
- local run or equivalent validation
- fresh verification evidence

Check:

- completion against spec
- verification sufficiency
- core path coverage
- edge case coverage
- known risks and leftovers
- unresolved decisions that still block delivery

Also check:

- does the evidence support the claim being made
- is the conclusion based on fresh commands, not assumptions
- if a command is noisy or failure-prone, was the optional auto-retry wrapper used instead of hand-transcribing stderr
- final claims should be paired with `verification-before-completion`
- if the task is reaching branch completion, `finishing-a-development-branch` should be part of the review lens

If orchestration is active, also check:

- repeated runs are stable enough
- fallback is real
- tool/time/token cost is acceptable
- orchestration did not create a new single point of failure
- the chosen mode is still better than a simpler mode

Pass when:

- the core path is validated
- completion claims match fresh evidence
- risks and leftovers are explicit
- delivery recommendation is clear

Fail when:

- only the happy path was checked
- spec still has major gaps
- claims are based on theory instead of evidence
- key risks are not surfaced
- delivery conclusion is vague

Output structure:

- completion assessment
- spec alignment
- verification review
- core path review
- risks and leftovers
- open confirmations
- orchestration deliverability review
- delivery recommendation

## 6. Pocket Version

Gate 1:

- is the goal clear
- is scope bounded
- is validation objective
- is execution mode justified

Gate 2:

- are we drifting
- are we expanding scope
- did we skip debugging or TDD
- is orchestration still worth it

Gate 3:

- is the core path actually verified
- does the evidence support the claim
- what remains risky
- is this really deliverable
