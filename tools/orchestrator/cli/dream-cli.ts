import { runDream } from "./dream.js";

async function main() {
  try {
    await runDream(process.cwd());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

void main();
