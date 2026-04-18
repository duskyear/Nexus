# Integrations

This document defines how `Nexus` should rely on optional external method sources and optional MCP servers.

If you need a step-by-step setup flow, use `integration-checklist.md`.

## Purpose

- `Nexus` remains the control plane for stage gates, state, evidence, and safety.
- `superpowers` is the method library for planning, debugging, review, verification, and branch completion.
- `oh-my-codex` is the runtime/workflow layer for Codex-oriented clarification, planning, orchestration, and completion loops.
- MCP is the standard way to connect live external tools and data when the local workflow truly benefits from them.

These integrations are optional enhancements for the full workflow experience, not core harness dependencies.

## Core Boundary

The local baseline remains:

- `AGENTS.md`
- `harness/`
- `tools/guard`
- `tools/control-plane`
- local bundled `skills/`

Do not make the base workflow depend on MCP. Use MCP only when it removes real copy/paste work or materially improves verification quality.

## Required External Sources

1. `superpowers`
- Source of skill content and method guidance.
- Expected to be discoverable by the local Codex environment.
- Preferred install shape on a new machine: clone the repository and expose its `skills/` directory to the Codex skill discovery path.
- Recommended install path:
  1. clone the upstream repository to a stable local path
  2. create the Codex-visible skill link or junction that points at that repository's `skills/` directory
  3. restart Codex so discovery can refresh

2. `oh-my-codex`
- Source of Codex workflow/runtime conventions.
- Expected to be installed or available through the local Codex workflow layer.
- Preferred install shape on a new machine: use the upstream installation method documented by the project.
- Recommended install path:
  1. install it with the upstream package or plugin mechanism
  2. restart Codex or the relevant runtime
  3. confirm the runtime exposes the OMX workflow surfaces you expect

## Recommended Local Setup

On a new machine, do the following before relying on upstream-only methods:

1. Run `node .\bootstrap.mjs --with-method-sources --superpowers-source-dir <path-to-superpowers> --omx-command <path-to-omx>` from the source tree or the equivalent package entrypoint in a published install.
2. If you are repairing an existing project, run `npm run doctor -- --fix --superpowers-source-dir <path-to-superpowers> --omx-command <path-to-omx>`.
3. Restart Codex or the relevant runtime so discovery can refresh.
4. Confirm the local bundled `skills/` subset still works inside this repository.
5. Only then rely on upstream-only skills or workflow helpers.

## Minimal MCP Set

For an individual `Codex` desktop user, the recommended MCP starting point is intentionally small:

1. `filesystem`
- Use when you need stable access to files outside the immediate repo working set.
- Do not use it to replace the local repo workflow.

2. `git`
- Use for richer repository inspection, history lookups, or branch metadata when local shell output is too awkward.
- Do not make basic git status/diff paths depend on MCP.

3. `fetch`
- Use for live external documentation, references, or remote content when local context is insufficient.
- Do not use it as a default substitute for local docs or provided project files.

Start with these three only. Add more MCP servers only after you can name the repeated manual step they eliminate.

## MCP Decision Rule

Use MCP when all three are true:

- the data is live or external
- the task would otherwise require repetitive copy/paste
- the added tool boundary is worth the context cost

Do not use MCP just because it exists. For many local coding tasks, direct file access plus the local harness is still the better path.

## MCP Non-Goals

- Do not turn MCP into a required runtime dependency for core stage gates.
- Do not add servers just to mirror capabilities the local shell already covers well.
- Do not treat more MCP servers as automatically better.
- Do not let MCP hide verification; the evidence still needs to be explicit in the harness.

## Verification

Use the smallest practical check that the external method sources and optional MCP setup are available:

- confirm the `superpowers` skill library is visible to the Codex environment
  - if you installed it as a clone, verify the `skills/` directory is reachable from the Codex skill discovery path
  - if you use a junction or symlink, verify it resolves to the pinned upstream clone
- confirm `oh-my-codex` is installed or discoverable in the intended runtime
  - verify the `omx` command or equivalent runtime surface is available
  - if your environment uses a plugin/install wrapper, verify it exposes the workflow entrypoints expected by `oh-my-codex`
- confirm the install manifest exists when you used `--with-method-sources`
  - inspect `harness/install-manifest.json` for the recorded source status
- confirm the local `skills/` subset still routes correctly through `harness-kit-release`
  - run `guard skills`
  - run one stage command such as `guard stage plan`
- if you intentionally enabled MCP, confirm the minimum set you rely on is available
  - `filesystem` if you need non-local file reach
  - `git` if you need repository metadata beyond the normal local path
  - `fetch` if you need live external documents

If a check fails, treat it as a capability reduction rather than a broken harness unless the current task explicitly depends on the missing upstream method.

## Missing Source Handling

If either upstream source is unavailable:

- continue with the local bundled `skills/` subset when possible
- report the missing capability clearly
- provide an install or update hint
- do not block core harness stage gates unless the current task truly requires the missing upstream method
- label the environment as partially capable rather than failed
- only escalate to a hard block when the requested work explicitly needs an upstream-only method

If optional MCP is unavailable:

- keep using the local harness and local repo workflow
- report the missing MCP capability as optional unless the task explicitly needs it
- prefer direct local files and local shell commands before introducing more MCP setup

## Versioning

- Prefer an explicit repository URL and version pin for each upstream source.
- Avoid assuming a globally installed copy is the source of truth.
- If you use a vendor snapshot or a symlinked clone for development, record the source and version in this document or a companion manifest.
- Record the current recommended upstream ref next to each source when you update this doc.

## Update Policy

- Update the local reference when the upstream method source changes in a way that affects stage routing or skill guidance.
- Keep upstream method sources read-only from the harness point of view.
- Do not let upstream changes silently alter harness stage gate behavior.
- If upstream changes a recommended command or install shape, update the verification section in the same change.

## Summary

The intended operating model is:

- `Nexus` decides whether work may proceed.
- `superpowers` says how to do the work.
- `oh-my-codex` helps Codex run that workflow smoothly.
- MCP provides optional live external context when the local path is not enough.
