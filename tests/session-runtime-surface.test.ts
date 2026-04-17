import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { runGuard } from "../tools/guard/cli/run.js";
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
  const root = await mkdtemp(join(tmpdir(), "harness-session-runtime-"));
  tempRoots.push(root);
  await mkdir(join(root, "harness"), { recursive: true });
  await writeFile(
    join(root, "harness", "guard.config.json"),
    JSON.stringify(
      {
        version: 1,
        stages: [
          "plan",
          "openspec",
          "review1",
          "implementation",
          "review2",
          "local_run",
          "review3",
          "hardening",
        ],
        allowed_transitions: {
          plan: ["openspec"],
          openspec: ["review1"],
          review1: ["implementation"],
          implementation: ["review2", "local_run"],
          review2: ["implementation", "local_run"],
          local_run: ["review3"],
          review3: ["hardening"],
          hardening: [],
        },
        required_plan_fields: [
          "objective",
          "scope",
          "non_scope",
          "acceptance_criteria",
          "task_breakdown",
          "validation_method",
        ],
        execution_mode_rules: {
          default: "single-agent",
          medium_complexity: "role-based single-agent",
          multi_agent_requires: [
            "approved_plan",
            "independent_subtasks",
            "reduced_context_pollution",
          ],
        },
        skill_triggers: {
          debugging: "systematic-debugging",
          behavior_change: "test-driven-development",
          completion_claim: "verification-before-completion",
          independent_subtasks: "subagent-driven-development",
        },
        skill_recommendations: {
          plan: ["brainstorming"],
          openspec: ["writing-plans"],
          review1: ["verification-before-completion"],
          implementation: ["test-driven-development"],
          review2: ["systematic-debugging"],
          local_run: ["verification-before-completion"],
          review3: ["verification-before-completion"],
          hardening: ["systematic-debugging"],
        },
        high_risk_changes: ["major_dependencies"],
        review_gates: ["review1", "review2", "review3"],
        claim_keywords: ["complete", "fixed", "passing", "ready", "deliverable"],
        permission_profiles: {
          default_by_stage: {
            plan: "read-only",
            openspec: "read-only",
            review1: "read-only",
            implementation: "workspace-write",
            review2: "read-only",
            local_run: "workspace-write",
            review3: "read-only",
            hardening: "workspace-write",
          },
          allow_dependency_changes: false,
          allow_unrelated_refactor: false,
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  return root;
}

describe("session and context runtime surface", () => {
  test("session status and context snapshot expose runtime telemetry", async () => {
    const cwd = await createWorkspace();
    const state = await loadControlPlaneState(cwd);
    state.runtime.tool_calls_used = 7;
    state.runtime.review_count = 2;
    state.runtime.verification_count = 4;
    state.runtime.fallback_count = 1;
    state.runtime.retries_used = 3;
    state.runtime.stage_entered_at = "2026-04-09T10:10:00.000Z";
    state.runtime.session_started_at = "2026-04-09T10:00:00.000Z";
    state.runtime.elapsed_ms = 600000;
    state.runtime.cap_warnings = 1;
    state.runtime.cap_blocks = 0;
    await saveControlPlaneState(cwd, state);

    const sessionStatus = await runGuard(["session", "status"], { cwd });
    expect(sessionStatus.status).toBe("PASS");
    expect((sessionStatus as Record<string, unknown>).session_surface).toBeDefined();
    expect((sessionStatus as Record<string, any>).session_surface.current_stage).toBe("plan");
    expect((sessionStatus as Record<string, any>).session_surface.permission_profile).toBe("read-only");
    expect((sessionStatus as Record<string, unknown>).runtime_summary).toEqual({
      tool_calls_used: 7,
      review_count: 2,
      verification_count: 4,
      fallback_count: 1,
      retries_used: 3,
      stage_entered_at: "2026-04-09T10:10:00.000Z",
      session_started_at: "2026-04-09T10:00:00.000Z",
      elapsed_ms: 600000,
      cap_warnings: 1,
      cap_blocks: 0,
    });

    const snapshot = await runGuard(["context", "snapshot"], { cwd });
    expect(snapshot.status).toBe("PASS");
    expect((snapshot as Record<string, unknown>).context_surface).toBeDefined();
    expect((snapshot as Record<string, any>).context_surface.attached_roots).toContain(cwd);
    expect((snapshot as Record<string, any>).context_surface.permission_profile).toBe("read-only");
    expect((snapshot as Record<string, unknown>).runtime_summary).toEqual({
      tool_calls_used: 7,
      review_count: 2,
      verification_count: 4,
      fallback_count: 1,
      retries_used: 3,
      stage_entered_at: "2026-04-09T10:10:00.000Z",
      session_started_at: "2026-04-09T10:00:00.000Z",
      elapsed_ms: 600000,
      cap_warnings: 1,
      cap_blocks: 0,
    });
  });

  test("usage summary exposes task and runtime counts", async () => {
    const cwd = await createWorkspace();
    const state = await loadControlPlaneState(cwd);
    state.runtime.tool_calls_used = 4;
    state.runtime.review_count = 1;
    state.tasks.tasks.push(
      {
        id: "task-1",
        title: "write usage summary",
        status: "open",
        owner_mode: "single-agent",
        evidence_refs: [],
        notes: [],
        blocked_reason: null,
        created_at: "2026-04-09T10:00:00.000Z",
        updated_at: "2026-04-09T10:00:00.000Z",
      },
      {
        id: "task-2",
        title: "close usage summary",
        status: "done",
        owner_mode: "single-agent",
        evidence_refs: ["verification-1"],
        notes: [],
        blocked_reason: null,
        created_at: "2026-04-09T10:05:00.000Z",
        updated_at: "2026-04-09T10:06:00.000Z",
      },
    );
    await saveControlPlaneState(cwd, state);

    const usage = await runGuard(["usage", "summary"], { cwd });

    expect(usage.status).toBe("PASS");
    expect((usage as Record<string, unknown>).usage_summary).toEqual(
      expect.objectContaining({
        current_stage: "plan",
        execution_mode: "single-agent",
        permission_profile: "read-only",
        task_counts: expect.objectContaining({
          total: 2,
          open: 1,
          done: 1,
          blocked: 0,
        }),
        runtime_summary: expect.objectContaining({
          tool_calls_used: 4,
          review_count: 1,
        }),
      }),
    );
  });

  test("session status compact exposes a shorter summary", async () => {
    const cwd = await createWorkspace();
    const state = await loadControlPlaneState(cwd);
    state.runtime.tool_calls_used = 5;
    await saveControlPlaneState(cwd, state);

    const sessionStatus = await runGuard(["session", "status", "--compact"], { cwd });

    expect(sessionStatus.status).toBe("PASS");
    expect((sessionStatus as Record<string, unknown>).session_compact).toEqual(
      expect.objectContaining({
        current_stage: "plan",
        execution_mode: "single-agent",
        permission_profile: "read-only",
        primary_root: cwd,
        runtime_summary: expect.objectContaining({
          tool_calls_used: 5,
        }),
      }),
    );
  });

  test("context export exposes a compact handoff package", async () => {
    const cwd = await createWorkspace();
    const state = await loadControlPlaneState(cwd);
    state.runtime.tool_calls_used = 6;
    state.tasks.tasks.push({
      id: "task-1",
      title: "export context",
      status: "open",
      owner_mode: "single-agent",
      evidence_refs: [],
      notes: [],
      blocked_reason: null,
      created_at: "2026-04-09T10:00:00.000Z",
      updated_at: "2026-04-09T10:00:00.000Z",
    });
    await saveControlPlaneState(cwd, state);

    const exported = await runGuard(["context", "export"], { cwd });

    expect(exported.status).toBe("PASS");
    expect((exported as Record<string, unknown>).context_export).toEqual(
      expect.objectContaining({
        current_stage: "plan",
        execution_mode: "single-agent",
        permission_profile: "read-only",
        primary_root: cwd,
        attached_roots: expect.arrayContaining([cwd]),
        task_counts: expect.objectContaining({
          total: 1,
          open: 1,
        }),
        evidence_counts: expect.objectContaining({
          verification_entries: 0,
          review_entries: 0,
        }),
        runtime_summary: expect.objectContaining({
          tool_calls_used: 6,
        }),
      }),
    );
  });

  test("context export can write a handoff file", async () => {
    const cwd = await createWorkspace();
    const state = await loadControlPlaneState(cwd);
    state.runtime.tool_calls_used = 6;
    await saveControlPlaneState(cwd, state);

    const outputPath = join(cwd, "handoff.json");
    const exported = await runGuard(["context", "export", "--output", outputPath], { cwd });

    expect(exported.status).toBe("PASS");
    expect((exported as Record<string, unknown>).context_export_path).toBe(outputPath);

    const fileContents = JSON.parse(await readFile(outputPath, "utf8")) as Record<string, unknown>;
    expect(fileContents).toEqual(
      expect.objectContaining({
        current_stage: "plan",
        execution_mode: "single-agent",
        permission_profile: "read-only",
        primary_root: cwd,
      }),
    );
  });
});
