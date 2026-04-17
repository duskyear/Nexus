# Verification Feedback and Context Discipline Proposal

## Summary

This change adds a conservative support layer around validation and task switching:

- an optional self-healing validation wrapper for noisy or failure-prone commands
- clearer harness prompts that insist on fresh evidence before completion claims
- stronger task-switching discipline based on state, handoff, and working directory

The goal is to reduce manual friction for a solo developer without turning the harness into a mandatory black box.

## Why this matters

- The repo already blocks unsupported completion claims through structured verification state.
- The current prompts explain verification, but they do not yet emphasize an opt-in repair loop for failed validation commands.
- Context control is mostly implicit today; the workflow benefits from a sharper rule for task handoff and workspace focus.

## Goal

Make the current harness easier to use in practice by:

- giving failed validation commands a reusable repair wrapper
- making the verification gate text more explicit and harder to ignore
- documenting how to switch tasks without pretending directory changes clear model context

## Non-goals

- Do not make the retry wrapper mandatory for every validation command.
- Do not rewrite `AGENTS.md` into a global prohibition on direct command execution.
- Do not claim that `cd` clears model memory.
- Do not remove MemPalace or any other external memory aid unless a separate investigation proves it is harmful.
- Do not change the existing stage model, review gates, or verification schema.

## Success Criteria

- A small retry wrapper exists and can be used on demand.
- Failed validation commands are surfaced with the original command, exit code, and stderr summary.
- Harness prompt templates explicitly require fresh evidence before completion claims.
- Task-switching guidance emphasizes state, handoff, and directory focus instead of "context reset by cd".
- The resulting change set stays small, reversible, and compatible with the existing harness flow.
