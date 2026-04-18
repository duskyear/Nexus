# Integration Checklist

Use this checklist when setting up a new machine for the full `Nexus` + optional upstream method sources + optional MCP workflow.

## 1. Required Sources

- [ ] `superpowers` is available as a local clone or equivalent pinned source
- [ ] `superpowers` skills are visible to the Codex skill discovery path
- [ ] `oh-my-codex` is installed or discoverable in the intended runtime
- [ ] the local bundled `skills/` subset in this repository is still present

## 1.5 Optional MCP

- [ ] only enable MCP if the current workflow actually benefits from live external tools or data
- [ ] start with the minimum set: `filesystem`, `git`, `fetch`
- [ ] do not add extra MCP servers without a named repeated manual step they remove

## 2. Install Path

- [ ] run `node .\bootstrap.mjs --with-method-sources --superpowers-source-dir <path-to-superpowers> --omx-command <path-to-omx>`
- [ ] clone or update `superpowers` to the pinned repository ref
- [ ] create the Codex-visible skill link or junction to the `superpowers/skills` directory
- [ ] install or update `oh-my-codex` using its upstream instructions
- [ ] run `npm run doctor -- --fix --superpowers-source-dir <path-to-superpowers> --omx-command <path-to-omx>` if a repair pass is needed
- [ ] restart Codex or the relevant runtime after both installs
- [ ] if using MCP, confirm only the minimum required servers are enabled

## 3. Verification

- [ ] run `guard skills`
- [ ] run `guard skills --stage plan`
- [ ] run `guard stage plan`
- [ ] confirm `guard skills` prints a sensible recommended-skill list
- [ ] confirm `guard stage plan` still behaves as a normal harness stage command
- [ ] confirm the local bundled skills still route correctly when upstream sources are available
- [ ] if MCP is enabled, confirm the minimum required server set is actually reachable

## 4. Missing Source Handling

- [ ] if `superpowers` is missing, keep using the local bundled `skills/` subset
- [ ] if `oh-my-codex` is missing, keep using the harness workflow and note the reduced-capability environment
- [ ] if optional MCP is missing, keep using local files and local shell flow
- [ ] only treat the missing source as a hard block when the current task explicitly depends on that upstream-only method
- [ ] record the missing capability clearly and provide the install/update hint

## 5. Versioning

- [ ] record the upstream repository URL for each source
- [ ] record the pinned ref or install version for each source
- [ ] update this checklist whenever the upstream installation or verification shape changes

## 6. Exit Criteria

- [ ] the machine can use the local harness workflow
- [ ] the machine can see the upstream skill library when needed
- [ ] the machine can see the upstream runtime/workflow layer when needed
- [ ] MCP, if enabled, is minimal and justified
- [ ] no core stage gate depends on an unstated local machine assumption
