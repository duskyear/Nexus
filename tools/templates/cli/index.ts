import { runTemplate } from "./run.js";

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const filteredArgs = args.filter((arg) => arg !== "--json");

  try {
    const result = await runTemplate(filteredArgs, { cwd: process.cwd() });
    if (asJson) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }

    process.stdout.write(`${result.content}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

void main();
