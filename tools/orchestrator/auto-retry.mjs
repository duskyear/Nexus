import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

function summarize(text, maxLength = 240) {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}...`;
}

function createShellExecutor(options) {
  return async (command) => {
    return await new Promise((resolve, reject) => {
      const child = spawn(command, {
        cwd: options.cwd,
        env: options.env,
        shell: true,
        windowsHide: true,
      });

      let stdout = "";
      let stderr = "";

      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");

      child.stdout?.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr?.on("data", (chunk) => {
        stderr += chunk;
      });
      child.on("error", reject);
      child.on("close", (exitCode) => {
        resolve({
          exitCode: exitCode ?? 1,
          stdout,
          stderr,
        });
      });
    });
  };
}

export function parseAutoRetryInvocation(args) {
  let maxRetries = 3;
  const commandParts = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--") {
      commandParts.push(...args.slice(index + 1));
      break;
    }

    if (arg === "--max-retries") {
      const next = args[index + 1];
      if (next && !next.startsWith("--")) {
        const parsed = Number(next);
        if (Number.isFinite(parsed) && parsed >= 0) {
          maxRetries = parsed;
        }
        index += 1;
        continue;
      }
    }

    if (arg.startsWith("--max-retries=")) {
      const parsed = Number(arg.split("=", 2)[1]);
      if (Number.isFinite(parsed) && parsed >= 0) {
        maxRetries = parsed;
      }
      continue;
    }

    commandParts.push(arg);
  }

  return {
    command: commandParts.join(" ").trim(),
    maxRetries,
  };
}

export async function runWithAutoRetry(command, options = {}) {
  const trimmedCommand = command.trim();
  const maxRetries = options.maxRetries ?? 3;

  if (!trimmedCommand) {
    return {
      status: "BLOCK",
      command,
      attempts: 0,
      retriesUsed: 0,
      exitCode: 1,
      stdout: "",
      stderr: "",
      reason: "a non-empty command is required for auto-retry.",
      nextStep: "Provide a command string to execute.",
    };
  }

  const executor = options.executor ?? createShellExecutor(options);
  const maxAttempts = maxRetries + 1;
  let lastResult = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    lastResult = await executor(trimmedCommand, attempt);
    if (lastResult.exitCode === 0) {
      return {
        status: "PASS",
        command: trimmedCommand,
        attempts: attempt,
        retriesUsed: attempt - 1,
        exitCode: 0,
        stdout: lastResult.stdout,
        stderr: lastResult.stderr,
        reason: `command '${trimmedCommand}' succeeded after ${attempt} attempt(s).`,
        nextStep: "Use the successful result as the fresh verification evidence.",
      };
    }
  }

  const exitCode = lastResult?.exitCode ?? 1;
  const stdout = lastResult?.stdout ?? "";
  const stderr = lastResult?.stderr ?? "";

  return {
    status: "BLOCK",
    command: trimmedCommand,
    attempts: maxAttempts,
    retriesUsed: maxRetries,
    exitCode,
    stdout,
    stderr,
    reason: `command '${trimmedCommand}' failed with exit code ${exitCode} after ${maxAttempts} attempt(s); stderr: ${summarize(stderr)}`,
    nextStep: "Use the stderr to repair the code, then rerun the validation command.",
  };
}

async function main() {
  const args = process.argv.slice(2);
  const { command, maxRetries } = parseAutoRetryInvocation(args);

  try {
    const result = await runWithAutoRetry(command, { maxRetries });

    if (result.status === "PASS") {
      console.log(`SUCCESS: ${result.command}`);
      console.log(`ATTEMPTS: ${result.attempts}`);
      console.log(`RETRIES USED: ${result.retriesUsed}`);
      process.stdout.write(result.stdout);
      if (result.stderr.trim()) {
        process.stderr.write(result.stderr);
      }
      process.exitCode = 0;
      return;
    }

    console.error(`FAILURE: ${result.command}`);
    console.error(`EXIT CODE: ${result.exitCode}`);
    console.error(`ATTEMPTS: ${result.attempts}`);
    if (result.stderr.trim()) {
      console.error(result.stderr);
    }
    process.exitCode = 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
}

const isDirectExecution = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectExecution) {
  await main();
}
