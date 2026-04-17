import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { loadControlPlaneState, saveControlPlaneState } from "../tools/control-plane/state/store.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (root) => {
      await rm(root, { recursive: true, force: true });
    }),
  );
});

async function createWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "harness-runtime-context-"));
  tempRoots.push(root);
  return root;
}

describe("runtime context telemetry", () => {
  test("initializes runtime telemetry and persists updates", async () => {
    const cwd = await createWorkspace();

    const state = await loadControlPlaneState(cwd);

    expect(state.runtime.tool_calls_used).toBe(0);
    expect(state.runtime.review_count).toBe(0);
    expect(state.runtime.verification_count).toBe(0);
    expect(state.runtime.fallback_count).toBe(0);
    expect(state.runtime.retries_used).toBe(0);
    expect(state.runtime.stage_entered_at).toBeNull();
    expect(state.runtime.session_started_at).toBeNull();
    expect(state.runtime.elapsed_ms).toBe(0);
    expect(state.runtime.cap_warnings).toBe(0);
    expect(state.runtime.cap_blocks).toBe(0);

    state.runtime.tool_calls_used = 3;
    state.runtime.review_count = 1;
    state.runtime.verification_count = 2;
    state.runtime.fallback_count = 1;
    state.runtime.retries_used = 4;
    state.runtime.stage_entered_at = "2026-04-09T10:00:00.000Z";
    state.runtime.session_started_at = "2026-04-09T09:55:00.000Z";
    state.runtime.elapsed_ms = 300000;
    state.runtime.cap_warnings = 2;
    state.runtime.cap_blocks = 1;

    await saveControlPlaneState(cwd, state);

    const runtimeFile = JSON.parse(
      await readFile(join(cwd, ".harness", "runtime-context.json"), "utf8"),
    ) as Record<string, unknown>;

    expect(runtimeFile.tool_calls_used).toBe(3);
    expect(runtimeFile.review_count).toBe(1);
    expect(runtimeFile.verification_count).toBe(2);
    expect(runtimeFile.fallback_count).toBe(1);
    expect(runtimeFile.retries_used).toBe(4);
    expect(runtimeFile.stage_entered_at).toBe("2026-04-09T10:00:00.000Z");
    expect(runtimeFile.session_started_at).toBe("2026-04-09T09:55:00.000Z");
    expect(runtimeFile.elapsed_ms).toBe(300000);
    expect(runtimeFile.cap_warnings).toBe(2);
    expect(runtimeFile.cap_blocks).toBe(1);
  });
});
