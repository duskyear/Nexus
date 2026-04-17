import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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

async function createWorkspace(runtimeCaps?: Record<string, { warn: number; block: number }>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "harness-runtime-caps-"));
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
        runtime_caps: runtimeCaps ?? {
          tool_calls_used: { warn: 8, block: 10 },
          review_count: { warn: 2, block: 3 },
          verification_count: { warn: 3, block: 5 },
          fallback_count: { warn: 1, block: 2 },
          retries_used: { warn: 3, block: 5 },
          elapsed_ms: { warn: 7200000, block: 14400000 },
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  await mkdir(join(root, ".harness"), { recursive: true });
  await writeFile(
    join(root, ".harness", "workflow-state.json"),
    JSON.stringify(
      {
        current_stage: "implementation",
        approved_plan: true,
        openspec_ready: true,
        review1_passed: true,
        review2_last_status: "unknown",
        local_run_confirmed: false,
        review3_status: "unknown",
        delivery_status: "unknown",
        execution_mode: "single-agent",
        adc_required: false,
        adc_completed: false,
      },
      null,
      2,
    ),
    "utf8",
  );
  return root;
}

describe("runtime caps enforcement", () => {
  test("warns when runtime telemetry is nearing a cap during stage transition", async () => {
    const cwd = await createWorkspace();
    const state = await loadControlPlaneState(cwd);
    state.runtime.tool_calls_used = 8;
    await saveControlPlaneState(cwd, state);

    const result = await runGuard(["stage", "review2"], { cwd });

    expect(result.status).toBe("WARN");
    expect(result.reason).toMatch(/cap/i);
    expect((result as Record<string, unknown>).runtime_caps).toMatchObject({
      status: "WARN",
    });
  });

  test("blocks stage transition when runtime telemetry exceeds a hard cap", async () => {
    const cwd = await createWorkspace();
    const state = await loadControlPlaneState(cwd);
    state.runtime.tool_calls_used = 10;
    await saveControlPlaneState(cwd, state);

    const result = await runGuard(["stage", "review2"], { cwd });

    expect(result.status).toBe("BLOCK");
    expect(result.reason).toMatch(/cap/i);
    expect((result as Record<string, unknown>).runtime_caps).toMatchObject({
      status: "BLOCK",
    });
  });

  test("respects runtime cap thresholds from guard config", async () => {
    const cwd = await createWorkspace({
      tool_calls_used: { warn: 2, block: 4 },
      review_count: { warn: 2, block: 3 },
      verification_count: { warn: 3, block: 5 },
      fallback_count: { warn: 1, block: 2 },
      retries_used: { warn: 3, block: 5 },
      elapsed_ms: { warn: 7200000, block: 14400000 },
    });
    const state = await loadControlPlaneState(cwd);
    state.runtime.tool_calls_used = 3;
    await saveControlPlaneState(cwd, state);

    const result = await runGuard(["stage", "review2"], { cwd });

    expect(result.status).toBe("WARN");
    expect(result.reason).toMatch(/cap/i);
    expect((result as Record<string, unknown>).runtime_caps).toMatchObject({
      status: "WARN",
    });
  });
});
