# Verification Feedback and Context Discipline Design

## Architecture

The design keeps enforcement where it already exists and adds a thin helper layer where the repo currently has manual friction.

The new behavior is split into three parts:

1. `auto-retry` wrapper for validation commands
2. prompt template tightening for verification and completion claims
3. documentation updates for task switching and context discipline

This is intentionally not a new orchestration framework. It is a small support path around the current harness.

## Component 1: Optional Auto-Retry Wrapper

`tools/orchestrator/auto-retry.mjs` should run an arbitrary command, capture exit status, and preserve stderr for repair-oriented feedback.

Behavior:

- accept a command string and an optional `--max-retries` value
- execute the command
- if exit code is `0`, report success and stop
- if exit code is non-zero, emit a concise failure summary that includes the command, exit code, and stderr
- retry only up to the configured limit
- stop with a blocking failure when the retry limit is reached

Design constraints:

- this wrapper is opt-in
- it must not hide the original failing command output
- it should not alter command semantics beyond retry orchestration and reporting
- it should remain dependency-free

## Component 2: Prompt Template Tightening

`harness/PROMPT_TEMPLATES.md` and `harness/REVIEW_GATE_CHECKLIST.md` should be updated to make the current policy more explicit:

- completion claims require fresh verification evidence
- failed validation means return to repair and re-run validation
- if a command is noisy or failure-prone, the wrapper is the recommended way to package the result

Important boundary:

- the text should recommend the wrapper
- the text should not require the wrapper for every command
- the text should not replace the existing structured verification model

## Component 3: Context Discipline Guidance

The task-switching guidance should focus on the controls the repo can actually enforce:

- use the most specific working directory that matches the task
- record handoff and state before switching tasks
- keep task scope and review gates explicit
- treat directory changes as file-scope narrowing, not memory clearing

If a future change wants stronger enforcement, it should be added as a localized policy command or helper, not by claiming that directory changes reset the model.

## Data Flow

1. A validation command fails or succeeds.
2. If the wrapper is used, it captures the command result and emits a structured retry summary.
3. Harness templates convert that result into a clear next action for the agent.
4. Task-switching guidance tells the agent how to move between modules without losing review/state discipline.

## Error Handling

- If the command cannot be launched, the wrapper should fail immediately with the launch error.
- If retries are exhausted, the wrapper should surface the last failure and stop.
- If stderr is empty, the wrapper should still report exit code and command.
- If the command is successful on the first run, no retry metadata should be fabricated.

## Risks

- Overusing the wrapper could make validation feel slower and less transparent.
- Writing the wrapper too generically could turn it into another hidden orchestration layer.
- If the wording in harness docs becomes too strong, it could drift back toward a mandatory policy that is harder to use than the current system.

## Validation

The implementation should be validated with:

- focused tests for the wrapper retry limit and failure reporting
- harness doc checks for the updated verification language
- a smoke run of the wrapper against one passing and one failing command
