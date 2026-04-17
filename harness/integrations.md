# Integrations

This document defines how `harness-kit-release` should rely on the external `superpowers` and `oh-my-codex` method sources.

If you need a step-by-step setup flow, use `integration-checklist.md`.

## Purpose

- `harness-kit-release` remains the control plane for stage gates, state, evidence, and safety.
- `superpowers` is the method library for planning, debugging, review, verification, and branch completion.
- `oh-my-codex` is the runtime/workflow layer for Codex-oriented clarification, planning, orchestration, and completion loops.

These integrations are environment prerequisites for the full workflow experience, not core harness dependencies.

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

## Verification

Use the smallest practical check that the external method sources are available:

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

If a check fails, treat it as a capability reduction rather than a broken harness unless the current task explicitly depends on the missing upstream method.

## Missing Source Handling

If either upstream source is unavailable:

- continue with the local bundled `skills/` subset when possible
- report the missing capability clearly
- provide an install or update hint
- do not block core harness stage gates unless the current task truly requires the missing upstream method
- label the environment as partially capable rather than failed
- only escalate to a hard block when the requested work explicitly needs an upstream-only method

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

- `harness-kit-release` decides whether work may proceed.
- `superpowers` says how to do the work.
- `oh-my-codex` helps Codex run that workflow smoothly.
