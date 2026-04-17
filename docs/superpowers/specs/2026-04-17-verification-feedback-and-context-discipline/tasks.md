# Verification Feedback and Context Discipline Tasks

## Task 1: Add the retry wrapper

- Create `tools/orchestrator/auto-retry.mjs`.
- Parse a command string and `--max-retries`.
- Run the command, capture stderr, and stop on success.
- Preserve the final failure details when retries are exhausted.

## Task 2: Tighten harness prompts

- Update `harness/PROMPT_TEMPLATES.md`.
- Update `harness/REVIEW_GATE_CHECKLIST.md`.
- Make fresh evidence a hard requirement in the wording.
- Mark the wrapper as recommended, not mandatory.

## Task 3: Clarify context discipline

- Update the relevant harness workflow text to describe task switching.
- Emphasize state, handoff, and task-local working directory usage.
- Avoid language that implies directory changes reset model memory.

## Task 4: Regression coverage

- Add tests for retry limit behavior.
- Add tests for preserved stderr and exit code reporting.
- Add tests for the prompt wording or helper output if the implementation exposes it.

## Task 5: Smoke validation

- Run one passing command through the wrapper.
- Run one failing command through the wrapper and confirm the failure surface is usable.
- Re-run the repo test suite if the implementation touches shared harness code.
