import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { loadControlPlaneState, saveControlPlaneState } from "../../control-plane/state/store.js";
import { constants } from "node:fs";
import { access } from "node:fs/promises";

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function runDream(cwd: string) {
  process.stdout.write("Starting Harness-Kit Memory Distillation (AutoDream)...\n");

  const state = await loadControlPlaneState(cwd);
  
  const doneTasks = state.tasks.tasks.filter((t) => t.status === "done");
  const openTasks = state.tasks.tasks.filter((t) => t.status !== "done");

  if (doneTasks.length === 0) {
    process.stdout.write("No 'done' tasks found to distil. Context is already compact.\n");
    return;
  }

  process.stdout.write(`Found ${doneTasks.length} completed tasks. Compacting...\n`);

  // 1. Move done tasks to archive
  const archiveDir = join(cwd, "docs", "archive");
  if (!(await pathExists(archiveDir))) {
    await mkdir(archiveDir, { recursive: true });
  }

  const dateStr = new Date().toISOString().replace(/[:.]/g, "-");
  const archivePath = join(archiveDir, `tasks-archive-${dateStr}.md`);

  const archiveContent = doneTasks.map(
    (t) => `- [x] **${t.id}**: ${t.title}\n  - Completed: ${t.updated_at}\n  - Evidence: ${t.evidence_refs.join(", ") || "None"}`
  ).join("\n\n");

  await writeFile(archivePath, `# Task Archive: ${dateStr}\n\n${archiveContent}`, "utf8");
  process.stdout.write(`=> Archived tasks to ${archivePath}\n`);

  // 2. Clear out done tasks from state
  const nextState = structuredClone(state);
  nextState.tasks.tasks = openTasks;
  await saveControlPlaneState(cwd, nextState);
  process.stdout.write(`=> Task ledger compacted in state file.\n`);

  // 3. Compact tasks.md
  const tasksMdPath = join(cwd, "tasks.md");
  let tasksMd = "";
  if (await pathExists(tasksMdPath)) {
    tasksMd = await readFile(tasksMdPath, "utf8");
    // Simple heuristic: we replace the tasks.md content with only open tasks.
    // However, string manipulation of markdown is risky without AST. We'll simply append a distillation note.
    const note = `\n\n> [!NOTE]\n> (AutoDream): ${doneTasks.length} completed tasks were compacted into \`${archivePath}\` to save context space.`;
    await writeFile(tasksMdPath, tasksMd + note, "utf8");
  }

  // 4. Compact Event Log
  const eventLogPath = join(cwd, ".harness", "event-log.jsonl");
  if (await pathExists(eventLogPath)) {
    const eventArchive = join(archiveDir, `event-log-archive-${dateStr}.jsonl`);
    const events = await readFile(eventLogPath, "utf8");
    await writeFile(eventArchive, events, "utf8");
    await writeFile(eventLogPath, "", "utf8"); // Truncate
    process.stdout.write(`=> Archived event log and truncated active log.\n`);
  }

  process.stdout.write("Memory Distillation Complete. Context is now pristine!\n");
}
