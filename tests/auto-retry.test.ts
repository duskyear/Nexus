import { describe, expect, test } from "vitest";

import { parseAutoRetryInvocation, runWithAutoRetry } from "../tools/orchestrator/auto-retry.mjs";

describe("auto-retry", () => {
  test("keeps wrapped command flags intact after the delimiter", () => {
    const parsed = parseAutoRetryInvocation([
      "--max-retries=2",
      "--",
      "vitest",
      "run",
      "--reporter",
      "verbose",
    ]);

    expect(parsed.maxRetries).toBe(2);
    expect(parsed.command).toBe("vitest run --reporter verbose");
  });

  test("retries a failed command until it succeeds", async () => {
    let attempts = 0;

    const result = await runWithAutoRetry("demo command", {
      maxRetries: 3,
      executor: async () => {
        attempts += 1;
        if (attempts < 3) {
          return {
            exitCode: 1,
            stdout: "",
            stderr: `boom-${attempts}`,
          };
        }

        return {
          exitCode: 0,
          stdout: "ok",
          stderr: "",
        };
      },
    });

    expect(result.status).toBe("PASS");
    expect(result.attempts).toBe(3);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("ok");
  });

  test("stops after the retry limit and preserves the final failure", async () => {
    const result = await runWithAutoRetry("demo command", {
      maxRetries: 2,
      executor: async (_command, attempt) => {
        return {
          exitCode: 17,
          stdout: "",
          stderr: `fail-${attempt}`,
        };
      },
    });

    expect(result.status).toBe("BLOCK");
    expect(result.attempts).toBe(3);
    expect(result.exitCode).toBe(17);
    expect(result.stderr).toContain("fail-3");
    expect(result.reason).toContain("exit code 17");
    expect(result.reason).toContain("demo command");
  });
});
