import { runSpawn } from "./spawn.js";

async function main() {
  const args = process.argv.slice(2);
  try {
    await runSpawn(process.cwd(), args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

void main();
