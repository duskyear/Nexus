import { loadControlPlaneState, saveControlPlaneState } from "../../control-plane/state/store.js";
import { join } from "node:path";
import { existsSync } from "node:fs";

function readFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}

export async function runSpawn(cwd: string, argv: string[]) {
  const agentName = readFlag(argv, "--agent");
  const taskDesc = readFlag(argv, "--task");

  if (!agentName || !taskDesc) {
    process.stderr.write("Usage: npm run harness:spawn -- --agent <name> --task <description>\n");
    process.exit(1);
  }

  // 1. Verify agent existence
  const agentPath = join(cwd, ".codex", "agents", `${agentName}.toml`);
  if (!existsSync(agentPath)) {
    process.stderr.write(`Error: Sub-agent role '${agentName}' not found in .codex/agents/\n`);
    process.exit(1);
  }

  // 2. Create the task in the ledger
  const state = await loadControlPlaneState(cwd);
  const taskId = `swarm-${agentName}-${Date.now()}`;
  
  const nextTask = {
    id: taskId,
    title: `[SWARM:${agentName}] ${taskDesc}`,
    status: "open",
    owner_mode: "multi-agent",
    evidence_refs: [],
    notes: [`Delegated to ${agentName} sub-agent.`],
    blocked_reason: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const nextState = structuredClone(state);
  nextState.tasks.tasks.push(nextTask);
  await saveControlPlaneState(cwd, nextState);

  // 3. Generate and provide the command
  process.stdout.write(`\n✅ Sub-agent task registered: ${taskId}\n`);
  process.stdout.write(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  process.stdout.write(`👉 PLEASE RUN THIS COMMAND IN YOUR TERMINAL (Codex):\n\n`);
  process.stdout.write(`   omx exec --agent ${agentName} "${taskDesc} (Result must be linked to task: ${taskId})"\n\n`);
  process.stdout.write(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  process.stdout.write(`Note: After completion, use --link-task ${taskId} to seal the evidence.\n`);
}
