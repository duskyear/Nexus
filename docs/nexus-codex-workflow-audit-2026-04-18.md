# Nexus Codex Workflow Audit (2026-04-18)

## Purpose

This document records the outcome of the recent "shrink-first" iteration on `Nexus`.

It answers four questions:

1. What is `Nexus` now?
2. What parts of the architecture materially help an individual `Codex` desktop user?
3. What parts still carry structural weight or integration overhead?
4. What should happen next, and what should explicitly not happen next?

## Current Product Definition

`Nexus` is now defined as:

> A local workflow enhancement layer for an individual `Codex` desktop user.

That means:

- the local harness is the core path
- upstream method sources are optional enhancements
- MCP is optional and intentionally minimal
- the system should improve boundedness, verification quality, and repeatability without becoming a platform

## What Is Already In Place

The following parts are already meaningfully implemented in the current repo:

### Product boundary

- `Nexus` is explicitly framed as a local workflow enhancement layer for an individual `Codex` desktop user.
- Upstream method sources are optional rather than required.
- MCP is optional and intentionally minimal.

### Rule layer

- The repo now carries explicit behavioral rules for:
  - thinking before coding
  - simplicity first
  - surgical changes
  - goal-driven execution
- Human-facing language policy is explicit:
  - Chinese for operator-facing interaction
  - English for code-facing and machine-facing surfaces

### Stage and work-mode model

- Stages remain the primary enforcement model.
- User-facing work modes now exist as a simpler interpretive layer:
  - `analysis`
  - `implementation`
  - `validation`
  - `delivery`

### Verification loop

- Completion claims require structured evidence.
- Verification evidence now supports stable `evidence_ref` identifiers.
- Claim evidence can be linked back to tasks.
- Claim events can carry evidence references.

### State model

- Split control-plane state remains the primary internal model.
- The legacy compatibility surface is thinner and more explicit than before.

### Skill layer

- Local bundled skills are part of the core path.
- Local skill metadata now has a normalized catalog surface.
- Project-local and bundled skills can be distinguished in skill discovery output.

## What Can Still Be Optimized

The following areas are still good candidates for future optimization:

### 1. Reduce upstream gravity further

Even after the boundary cleanup, the repo still carries visible `superpowers` / `OMX` terminology and integration scaffolding.

Optimization goal:

- keep the local path clearly primary
- keep upstream-only flows truly optional

### 2. Continue trimming legacy compatibility cost

The legacy state path is smaller than before, but it still exists.

Optimization goal:

- reduce the number of future features that need dual legacy/control-plane reasoning
- keep the compatibility layer from becoming the design center again

### 3. Measure actual user benefit

The repo is now more coherent, but coherence is not the same thing as user benefit.

Optimization goal:

- validate that the current shape actually reduces:
  - prompt repetition
  - scope drift
  - false completion claims
  - unnecessary edits

### 4. Keep skill growth disciplined

The local skill system is stronger now, but it can still become noisy.

Optimization goal:

- add skills only when they remove repeated operator effort
- avoid turning the skill layer into another dense instruction archive

### 5. Keep MCP minimal

The MCP boundary is now cleaner, but future additions could still bloat the system.

Optimization goal:

- only add MCP servers when they remove a real repeated manual step
- keep the default set intentionally small

## Boundary With Codex Native Subagents And Automation

This section records the intended boundary between `Nexus`, `Codex` native subagents, optional upstream method sources, and future automation.

### 1. Optional enhancement layers

`superpowers` and `OMX` are optional enhancement layers.

This means:

- they may be used proactively
- they may be selected by the agent when the task shape justifies them
- they must not become a hard prerequisite for the local `Nexus` core path

The intended decision order is:

1. Check whether the local `Nexus` core path is sufficient.
2. If not, decide whether `superpowers` / `OMX` adds meaningful value.
3. Only then choose the relevant skill, workflow, or subagent path.

Architecturally, `Nexus` may define when these enhancements should be used. Execution still depends on the host environment and its permissions.

### 2. Current subagent capability

The current system already has meaningful subagent capability.

It already includes:

- role surfaces
- execution modes
- role-based single-agent vs multi-agent distinctions
- lead/worker concepts
- skill-guided subagent execution paths
- `OMX` role prompts and native subagent affordances

So the current state is not "no subagent support."

The more accurate description is:

> The system already supports role-based delegation and parallel work, but it has not been expanded into a heavier orchestration layer.

### 3. What must not happen

`Nexus` should not become a second scheduler on top of `Codex`.

That means avoiding:

- a separate worker scheduler
- a separate task-graph runtime
- a duplicate role allocation system that conflicts with native subagent behavior
- a second parallel orchestration engine with its own lifecycle rules

If that happens, the likely result is double orchestration:

- duplicated planning
- conflicting ownership
- inconsistent task state
- rising coordination cost

The intended relationship is:

- `Codex` handles execution and native subagent mechanics
- `Nexus` defines rules, boundaries, and governance

In other words:

> `Nexus` should be a strategy and governance layer, not a second dispatcher.

### 4. Automation guidance

Heavier automation exists as a future possibility, but the default assumption should be restraint.

Light automation that is usually worth it:

- automatic evidence capture
- automatic task-to-evidence linkage
- automatic work-mode or session-status surfacing
- automatic skill recommendation
- doctor/bootstrap/repair helpers

Automation that is more likely to become too heavy for the current goal:

- scheduled repo-wide patrols
- automatic retrospection and rule rewriting
- automatic multi-agent task-graph orchestration
- automatic reviewer return loops
- cross-repo synchronization machinery
- long-horizon recovery orchestration

The current product goal is still:

> improve the workflow of an individual `Codex` desktop user

So new automation should only be accepted if it clearly reduces repeated local operator effort without turning `Nexus` into a platform runtime.

### 5. Open-source feature caution

The presence of an open-source repository for a capability is not, by itself, a reason to absorb that capability.

A future addition is only justified when it:

- removes real repeated operator work
- does not create a second scheduler
- preserves the viability of the local core path
- directly serves `Codex` personal workflow improvement

It should be rejected or deferred when it:

- mainly solves a team/platform/cloud problem
- duplicates capabilities `Codex` already provides
- requires substantial new state-management complexity
- adds more architectural weight than practical user benefit

## What Was Strengthened

### 1. Product boundary

The repository now states clearly that:

- `Nexus` is not a general-purpose agent platform
- `superpowers` and `OMX` are optional method sources
- MCP is optional and should start with the minimum set

Primary files:

- `README.md`
- `USAGE_GUIDE.md`
- `AGENTS.md`
- `harness/integrations.md`

### 2. Behavioral contract

The rule layer now explicitly carries four principles:

- Think Before Coding
- Simplicity First
- Surgical Changes
- Goal-Driven Execution

These are now visible in:

- `AGENTS.md`
- `harness/PROMPT_TEMPLATES.md`
- `harness/REVIEW_GATE_CHECKLIST.md`
- `harness/HARNESS_WORKFLOW.md`

### 3. State-model cleanup

The legacy compatibility surface became smaller and clearer:

- `HarnessState` is defined once in `tools/guard/schema/state.ts`
- split control-plane state remains the primary internal model
- legacy-state detection is handled by an explicit helper instead of a long inline condition

Primary files:

- `tools/guard/schema/state.ts`
- `tools/guard/state/store.ts`
- `tools/control-plane/state/store.ts`
- `tools/guard/core/types.ts`

### 4. Skill structure

Local skills now expose a minimal catalog with normalized metadata:

- `name`
- `description`
- `source`
- `path`

The `guard skills` command now surfaces local skill metadata without changing the recommendation model.

Primary files:

- `tools/guard/core/skills.ts`
- `tools/guard/cli/run.ts`

### 5. Verification loop

Verification now produces traceable evidence objects:

- verification entries carry `evidence_ref`
- `verify-claim` can link evidence to task ids
- claim events can include `evidence_refs`

Primary files:

- `tools/guard/cli/run.ts`
- `tools/control-plane/schema/evidence-log.ts`
- `tools/control-plane/core/event-log.ts`
- `tools/control-plane/state/store.ts`

### 6. User-facing work modes

The stage model is now translated into a simpler user-facing work-mode layer:

- `analysis`
- `implementation`
- `validation`
- `delivery`

This exists only on the surface layer, not as a new persisted state source.

Primary files:

- `tools/control-plane/core/session.ts`
- `tools/control-plane/registry/commands.ts`
- `tools/guard/cli/index.ts`
- `harness/POCKET_GUIDE.md`

## What Materially Helps a Codex Desktop User

From a practical user perspective, the most valuable parts of the architecture are:

### Stage-aware guardrails

The stage model plus permission profiles reduce the two most common agent failures:

- editing too early
- validating too late

### Structured evidence

Fresh verification evidence is the strongest anti-slop mechanism in the repo.

It converts "I think it is done" into:

- claim
- command
- exit code
- summary
- evidence reference

### Session and context surfaces

The session/context exports are useful because they compress the current repo state into a handoffable object instead of forcing the next step to re-derive everything from chat history.

### Local skills

A small local skill bundle is more valuable than a giant upstream dependency set for day-to-day use. It gives repeatability without turning every task into an integration problem.

## What Still Carries Weight

These are the parts that still deserve caution:

### 1. Upstream integration gravity

Even after the boundary cleanup, the repository still carries a lot of `superpowers` / `OMX` vocabulary and wiring.

This is acceptable only if:

- the local path remains complete on its own
- upstream-only features never quietly become required

### 2. Legacy compatibility tax

The legacy state path is thinner now, but it still exists.

That means every future change touching:

- state persistence
- verification entries
- task linkage

must still be reviewed for compatibility impact.

### 3. Rule density

The architecture is safer now, but it is also denser.

That is only worth it if the repo continues to improve actual user outcomes:

- fewer scope errors
- fewer false completion claims
- less prompt repetition
- less rework

If future changes add more rules without improving those outcomes, that would be negative progress.

## What Should Happen Next

The next step should not be "add another layer."

The next step should be a reality check against actual usage.

Recommended next actions:

1. Run a small sample of real tasks through the current `Nexus` flow.
2. Record where the local workflow feels heavier than plain `Codex`.
3. Keep only the rules and surfaces that clearly reduce mistakes or repeated explanation.

## What Should Not Happen Next

Do not do these by default:

- do not build a platform runtime
- do not add database/auth/cloud concerns
- do not expand MCP usage beyond the minimal set without a concrete manual pain point
- do not add more stage logic without a measured failure mode behind it
- do not make upstream method sources more central than the local harness

## Decision Rule for Future Iterations

Before accepting a new `Nexus` feature, ask:

1. Does this reduce repeated explanation for the individual `Codex` user?
2. Does this reduce scope drift, false completion, or verification gaps?
3. Does this keep the local path viable without upstream runtime assumptions?
4. Is this lighter than the problem it solves?

If the answer to any of the last two is "no", the default decision should be to reject or defer the feature.

## Execution Plan For Future Optimization Boundaries

This section turns the boundary rules above into an execution plan.

The goal is not to add as many features as possible.

The goal is:

> keep `Nexus` useful for an individual `Codex` desktop user without turning it into a second orchestration platform.

### A. Optional enhancement layers: execution plan

Policy:

- `superpowers` and `OMX` stay available
- they may be used proactively when the task shape justifies them
- they do not become baseline requirements

Execution steps:

1. Keep the local path fully documented and operational on its own.
2. When adding a new workflow helper, write the local fallback path first.
3. Only after the local fallback exists, add optional upstream routing or references.
4. In docs and prompts, describe upstream capabilities as enhancements, not prerequisites.
5. In future reviews, reject any change that makes a core stage gate unusable without an upstream runtime.

Acceptance test:

- a user can still execute the normal local workflow with only the repo-local assets
- missing upstream method sources degrade capability, but do not break the core harness path

### B. Codex native subagents and Nexus: execution plan

Policy:

- `Codex` native subagents remain the execution mechanism
- `Nexus` defines when delegation is justified and what boundaries apply
- `Nexus` does not replace the native subagent layer

Execution steps:

1. Keep role definitions and execution-mode rules in the policy layer only.
2. Let `Codex` handle subagent spawning and role execution where the host allows it.
3. Keep `Nexus` focused on:
   - eligibility rules
   - role boundaries
   - validation requirements
   - fallback rules
4. When adding new subagent-related features, prefer:
   - better role guidance
   - better ownership rules
   - better review/verification rules
   instead of new orchestration engines.

Acceptance test:

- delegation behavior becomes clearer without introducing a second runtime authority

### C. Prevent Nexus from becoming a second scheduler: execution plan

Policy:

- `Nexus` may be a strategy layer
- `Nexus` must not become a second dispatcher

What to reject by default:

- repo-local worker schedulers
- repo-local task-graph runtimes
- duplicate role allocators that compete with `Codex`
- independent parallel orchestration layers with separate lifecycle state

Execution steps:

1. Before accepting any orchestration-related change, ask:
   - is this policy, or is this scheduling?
2. If it is scheduling, reject or defer it by default.
3. If it is policy, keep it in:
   - `AGENTS.md`
   - `harness/`
   - control-plane state or evidence only when necessary
4. If a future feature needs coordination state, keep that state descriptive, not imperative.

Acceptance test:

- there is still only one effective execution authority at runtime
- `Nexus` adds guidance, not parallel command and ownership systems

### D. Light automation: execution plan

These are acceptable and should be prioritized when they remove repeated operator effort.

Current good targets:

- automatic evidence capture
- automatic evidence-to-task linkage
- automatic session/work-mode surfacing
- automatic skill recommendation
- doctor/bootstrap/repair flows

Execution steps:

1. Prefer automation that enriches existing outputs.
2. Prefer automation that reduces manual bookkeeping.
3. Keep the automation local and observable.
4. Require each new automation to declare:
   - what repeated step it removes
   - what evidence it produces
   - how it fails safely

Acceptance test:

- the operator performs fewer repetitive workflow steps
- the system remains understandable from local outputs and logs

### E. Heavy automation: execution plan

These are not forbidden forever, but they should be deferred until proven necessary.

Heavy candidates:

- scheduled repo patrols
- automatic retrospection and rule mutation
- automatic multi-agent task-graph execution
- automatic reviewer return loops
- cross-repo synchronization
- long-horizon recovery orchestration

Execution steps:

1. Do not implement these as default roadmap items.
2. Only revisit them after repeated real-task evidence shows a stable local pain point.
3. Before building any heavy automation, write a short ADR that answers:
   - what manual pain point repeats?
   - why light automation is insufficient?
   - why this does not create a second scheduler?
   - what will be measured to justify the weight?

Acceptance test:

- a heavy automation candidate is only accepted with a concrete repeated operator pain point and a measurable payoff

### F. Open-source intake rule: execution plan

Policy:

- a GitHub repository is not an argument by itself
- imported patterns must serve the current product goal

Execution steps:

1. For each external repo or pattern, classify it first:
   - rule layer
   - skill layer
   - MCP/tool layer
   - local loop ergonomics
   - platform/runtime layer
2. Accept by default only if it:
   - reduces repeated local operator work
   - does not create a second scheduler
   - preserves the local core path
   - directly improves the `Codex` personal workflow
3. Reject or defer by default if it:
   - mainly serves cloud/team/platform use cases
   - duplicates native `Codex` capability
   - demands substantial new orchestration state
   - adds more weight than user benefit

Acceptance test:

- every adopted external pattern can be traced to a clear local user benefit

### G. Review cadence

To keep future work aligned with these boundaries, use this cadence:

1. Real-task validation first
2. Small local improvement second
3. Boundary review third
4. Only then consider larger feature additions

The default future order should be:

- validate with real tasks
- remove friction
- simplify
- only then extend

## Verification

At the time of writing this audit, the repository test suite passes:

- `vitest run`
- 15 test files
- 54 tests

This audit is not a new architectural promise. It is a checkpoint stating what the repo currently is and what direction is still justified.
