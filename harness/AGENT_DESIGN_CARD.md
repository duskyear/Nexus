# AGENT_DESIGN_CARD

## Task Name
- Harness closure validation

## Why This Needs Multi-Agent
- Needed only for controlled validation of independent docs/tests workstreams.
- Lower context pollution than one shared long-running thread.
- Skill routing is separate from agent topology; skill names describe methods, not worker roles.

## Execution Mode
- multi-agent

## Topology
- orchestrator-worker

## Subtask Split
- Parallelizable: docs, tests
- Non-parallelizable: schema

## Context Strategy
- Shared rules, isolated task execution, explicit handoff through lead.

## Tool Boundary
- Lead-only tools: workflow decisions
- Worker-allowed tools: bounded implementation/test tasks
- Forbidden tools: unrelated repo mutation

## Budget Caps
- max_subagents: 2
- max_tool_calls: 20
- max_retries: 2
- max_runtime: 15m
- max_token_budget: bounded

## HITL Checkpoints
- Before mode upgrade
- Before fallback
- Before high-risk changes

## Fallback Path
- Downgrade target: role-based single-agent
- Downgrade trigger: boundary collapse or coordination overhead

## Stop Conditions
- Context pollution
- Duplicated work
- Coordination cost exceeds value
- Caps exceeded
- Fallback not viable

## Risks / Open Questions
- Keep orchestration limited to clearly independent subtasks.
