# Nexus

`Nexus` is a local workflow enhancement layer for individual `Codex` desktop users.

It adds three things on top of plain repository prompting:

- a stage-aware execution harness
- structured state, evidence, and task tracking
- a small local skill bundle for recurring workflows

## What Nexus Is

- A local, repo-scoped workflow layer
- A stricter way to express task boundaries, validation, and delivery claims
- A thin control plane around `Codex`, not a replacement for it
- A system that still works with only the local repo assets in this repository

## What Nexus Is Not

- Not a general-purpose agent platform
- Not a cloud runtime, sandbox service, or multi-user control plane
- Not a requirement to run the full `superpowers` or `OMX` stack
- Not a reason to default every task into multi-agent orchestration

## Core Model

`Nexus` is split into four local layers:

- `AGENTS.md`: long-lived rules and operating constraints
- `harness/`: stage flow, prompt templates, review gates, and operator guidance
- `tools/`: guard, control-plane, orchestration helpers, and template commands
- `skills/`: local, high-frequency workflow methods

Local skills are discovered from `skills/<name>/SKILL.md` and should declare at least:

- `name`
- `description`

## Language Policy

For this repository:

- user-facing human interaction should default to Chinese when the operator is using Chinese
- code, schema keys, structured outputs, skill metadata, and other machine-facing surfaces should remain in English by default

## Default Path

For day-to-day `Codex` desktop use, prefer the lightest path that preserves verification quality.

Small task:

- use a focused task prompt
- make the smallest valid change
- run the smallest relevant validation
- do not claim completion without evidence

Medium task:

- `plan`
- `implementation`
- `local_run`
- `review3`

High-risk task:

- pause for explicit high-risk confirmation
- keep scope narrow
- verify before any completion claim

## Optional Method Sources

`superpowers` and `oh-my-codex` are optional method sources.

Use them when they add value:

- deeper planning and review workflows
- richer external skill libraries
- runtime-specific `OMX` workflows in environments that actually support them

Do not treat them as required for the base `Nexus` workflow. The local `guard`, `harness`, `control-plane`, and bundled `skills` remain the core path.

## Optional MCP

MCP is optional in `Nexus`.

If you need live external tools or data, start with the smallest useful set:

- `filesystem`
- `git`
- `fetch`

Do not make the base local workflow depend on MCP. For many personal `Codex` tasks, the local harness plus direct repo access is still the better path.

## Local Development

Run the test suite:

```bash
.\node_modules\.bin\vitest.cmd run
```

Useful local scripts:

```bash
npm run guard
npm run doctor
npm run template
npm run orchestrator
```

## Install Into Another Project

From this source tree:

```bash
node .\bootstrap.mjs
```

If you want optional upstream method sources as well:

```bash
node .\bootstrap.mjs --with-method-sources --superpowers-source-dir C:\path\to\superpowers --omx-command C:\path\to\omx.cmd
```

## What Gets Installed

`bootstrap.mjs` copies the local template into the target project and adds local scripts for:

- `guard`
- `doctor`
- `template`
- `orchestrator`

It also copies the bundled `skills/` subset, writes `harness.version.json`, and writes `harness/install-manifest.json`.

## Notes

- This repository is the source tree, not the generated target project
- The local workflow should remain useful even without optional upstream integrations
- See [docs/nexus-codex-workflow-audit-2026-04-18.md](/C:/Users/Administrator/Desktop/Nexus/docs/nexus-codex-workflow-audit-2026-04-18.md) for the current architecture audit and direction checkpoint
