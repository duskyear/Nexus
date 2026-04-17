import { runOrchestrator } from "./run.js";

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const filteredArgs = args.filter((arg) => arg !== "--json");

  try {
    const result = await runOrchestrator(filteredArgs, { cwd: process.cwd() });
    if (asJson) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }

    process.stdout.write(`${result.status}: ${result.reason}\n`);
    process.stdout.write(`next_step: ${result.next_step}\n`);
    if (result.execution_mode) {
      process.stdout.write(`execution_mode: ${result.execution_mode}\n`);
    }
    if (result.parallelizable) {
      process.stdout.write(`parallelizable: ${result.parallelizable.join(", ")}\n`);
    }
    if (result.non_parallelizable) {
      process.stdout.write(`non_parallelizable: ${result.non_parallelizable.join(", ")}\n`);
    }
    if (result.lead) {
      process.stdout.write(`lead: ${result.lead.join(", ")}\n`);
    }
    if (result.workers) {
      process.stdout.write(`workers: ${result.workers.join(", ")}\n`);
    }
    if (result.fallback) {
      process.stdout.write(`fallback: ${result.fallback}\n`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

void main();
