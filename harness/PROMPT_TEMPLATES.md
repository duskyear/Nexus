# PROMPT_TEMPLATES.md

This file contains reusable prompt templates only. Rules and explanations live elsewhere.

## 1. Planning

```text
Do not implement yet.

Please turn this request into an executable plan with:
- objective
- scope
- non-scope
- acceptance criteria
- task breakdown
- risks / open questions
- relevant files
- validation method

Also decide:
- execution mode: single-agent / role-based single-agent / multi-agent
- whether AGENT_DESIGN_CARD is required
- likely workflow skills to consult first, if any

If the request is unclear, call out the first skill that should guide clarification, such as `deep-interview` for ambiguity or `brainstorming` for design.
State any material assumptions explicitly instead of silently choosing one interpretation.
If there are multiple plausible interpretations, name them and explain which one still needs confirmation.

If the task is not yet concrete enough to implement safely, make that explicit instead of guessing.
```

## 2. OpenSpec

```text
Enter the OpenSpec stage now.

Based on the approved plan, produce:
- proposal.md
- specs/
- design.md
- tasks.md

Do not implement yet.
Do not skip design.
Do not turn unresolved decisions into settled facts.
Use the smallest artifact set that makes the next review gate and implementation path unambiguous.
If the task is medium or large, spans multiple files or modules, or needs a fuller artifact set, you may use an external OpenSpec skill as an aid. It is optional.
```

## 3. Review Gate 1

```text
Do not implement yet.

Run Review Gate 1 against the current OpenSpec artifacts and plan.
Review:
- objective alignment
- scope / non-scope clarity
- design feasibility
- task order
- acceptance criteria
- unresolved decisions
- execution mode justification

If orchestration is in scope, review whether it is actually justified and whether AGENT_DESIGN_CARD is complete.
End with a clear conclusion: implementable now / blocked until fixes / blocked until confirmation.
```

## 4. Implementation Batch

```text
Enter the implementation stage now.

Only handle one task or one small batch.
Do not silently expand scope.
Do not do unrelated cleanup or refactor.
Do not make hidden assumptions when the request or code behavior is ambiguous.
Prefer the simplest implementation that satisfies the current task.
Do not introduce speculative abstractions, configurability, or flexibility that was not requested.
Touch only files and code paths that are directly related to the current task.
If the task is behavior-changing work, default to TDD.
If the task is debugging work, follow systematic-debugging first.
If the task needs broader workflow help, consider the local bundled skills first and then upstream reference skills such as `requesting-code-review`, `receiving-code-review`, or `finishing-a-development-branch` when relevant.

After the batch, report:
1. current task
2. files changed
3. validation run
4. result
5. remaining risks / next step
```

## 5. Focused Small Task

```text
Only handle this one small task.

Rules:
- make only necessary changes
- prefer minimal, targeted edits
- avoid hidden assumptions; state them if they matter
- avoid unnecessary abstractions or "while I'm here" improvements
- do not modify adjacent code unless the current task requires it
- stop before any high-risk change
- do not upgrade to multi-agent without a real justification
- run the smallest relevant validation
- do not claim completion without evidence

Report:
1. current task
2. files changed
3. validation run
4. result
5. remaining risks / next step
```

## 6. High-Risk Change Confirmation

```text
Pause implementation.

This task now involves at least one high-risk change:
- adding major dependencies
- changing architecture significantly
- changing database schema
- changing public APIs
- unrelated cleanup or refactors

Output only:
1. what high-risk change is involved
2. why it is needed
3. what happens if we do not do it
4. realistic alternatives
5. what requires explicit confirmation
```

## 7. Review Gate 2

```text
Pause implementation and run Review Gate 2.

Review:
- goal alignment
- scope control
- design consistency
- blockers and new risks
- whether hidden assumptions or silent interpretation changes appeared
- whether the implementation became more abstract or configurable than the task required
- whether unrelated files or adjacent code were touched without justification
- whether debugging / TDD flow was skipped

If orchestration is active, also review:
- context pollution
- duplicated work
- role overlap
- cap overruns
- whether execution mode should be downgraded

End with one recommendation:
- continue
- correct course
- stop for confirmation
```

## 8. Validation / Runtime Check

```text
Do not expand product scope.

Move into local run / environment validation:
1. identify the project runtime shape
2. establish the local environment
3. resolve basic dependency or startup blockers
4. run the core path
5. verify the relevant interface, input/output, or integration boundary
6. summarize the runtime and validation result only within current scope

If the relevant boundary is ambiguous, list the possible meanings instead of expanding scope by default.
```

## 9. Review Gate 3

```text
Do not implement new work.

Run Review Gate 3 based on:
- OpenSpec artifacts
- implemented code
- local run or equivalent validation
- fresh verification evidence

If the task is nearing completion, expect `verification-before-completion` to be part of the review path.
If the work is a branch closeout, consider `finishing-a-development-branch` as the final workflow helper.

Focus on:
- whether the work is actually complete enough to claim
- whether the evidence supports the claim
- what remains risky
- whether the result is deliverable, conditionally deliverable, or not deliverable
```

## 10. Production Hardening

```text
Do not reopen broad feature development.

Enter production hardening and focus on:
- stability
- auth
- deployment
- logging
- monitoring
- configuration management
- security policy

Treat this as optional and only enter it after Review Gate 3 says the work is at least conditionally deliverable.

Output a hardening checklist with priorities and implementation order.
```

## 11. Root-Cause Debugging

```text
Do not jump straight to a fix.

Follow a root-cause debugging flow:
1. read the error and surrounding context carefully
2. define reproduction steps
3. inspect recent relevant changes
4. gather missing diagnostics if needed
5. state one concrete root-cause hypothesis
6. propose the smallest validation step

Do not implement a fix before the hypothesis and the smallest validation step are explicit.

Output:
- symptom
- reproduction
- evidence
- root-cause hypothesis
- smallest validation step
- what not to do yet
```

## 12. Verification Before Completion

```text
Do not claim completion yet.

Please:
1. identify the command that proves the current claim
2. run it now
3. read the full output and exit code
4. capture the command, exit code, and result summary as structured evidence
5. state the concrete success criteria for the claim
6. state whether the evidence really supports the claim
7. if the command is noisy or failure-prone, prefer the optional auto-retry wrapper so stderr and retry count stay attached to the evidence
8. if a task ledger exists, link the claim back to task ids and evidence refs

Output:
- claim being evaluated
- success criteria
- verification evidence
- fresh verification evidence only, not stale claims
- whether the claim is supported
- actual status if unsupported
```

## 13. Default TDD Loop

```text
This task changes behavior. Use the smallest TDD loop:
1. write a failing test for one behavior
2. run it and confirm it fails for the expected reason
3. write the minimum implementation
4. run the test again and confirm it passes
5. run the smallest relevant regression check

Report:
1. current task
2. files changed
3. failing test written
4. validation run
5. result
6. remaining risks / next step
```

## 14. Execution Mode Decision

```text
Decide the execution mode before implementation.

Choose exactly one:
1. single-agent
2. role-based single-agent
3. multi-agent

Explain:
- why this mode fits the task
- why a simpler mode is insufficient, if applicable
- why a more complex mode is unnecessary, if applicable

If multi-agent is chosen, also provide:
- lead responsibility
- worker responsibility
- subagent cap
- tool boundary
- budget caps
- HITL checkpoints
- fallback path
- main risks and controls
```
