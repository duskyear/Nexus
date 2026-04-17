import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { runGuard } from "../tools/guard/cli/run.js";
import { loadControlPlaneState } from "../tools/control-plane/state/store.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (root) => {
      await rm(root, { recursive: true, force: true });
    }),
  );
});

async function createWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "harness-exec-link-task-"));
  tempRoots.push(root);

  await mkdir(join(root, "harness"), { recursive: true });
  await mkdir(join(root, ".harness"), { recursive: true });
  await writeFile(
    join(root, "harness.version.json"),
    JSON.stringify({ version: 1 }, null, 2),
    "utf8",
  );
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
          plan: ["brainstorming", "writing-plans", "deep-interview", "ralplan"],
          openspec: ["writing-plans", "verification-before-completion"],
          review1: ["verification-before-completion"],
          implementation: [
            "using-git-worktrees",
            "executing-plans",
            "test-driven-development",
            "subagent-driven-development",
            "requesting-code-review",
            "receiving-code-review",
            "systematic-debugging",
          ],
          review2: ["test-driven-development", "systematic-debugging", "requesting-code-review", "receiving-code-review"],
          local_run: ["verification-before-completion"],
          review3: ["verification-before-completion", "finishing-a-development-branch"],
          hardening: ["systematic-debugging", "verification-before-completion"],
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

describe("guard exec task linking", () => {
  test("persists evidence refs when exec links a task", async () => {
    const cwd = await createWorkspace();

    const added = await runGuard(["task", "add", "--id", "task-1", "--title", "Capture output"], { cwd });
    expect(added.status).toBe("PASS");

    const executed = await runGuard(["exec", "echo", "linked", "--link-task", "task-1"], { cwd });
    expect(executed.status).toBe("PASS");

    const state = await loadControlPlaneState(cwd);
    expect(state.tasks.tasks).toHaveLength(1);
    expect(state.tasks.tasks[0].evidence_refs.some((ref) => ref.startsWith("exec-output-"))).toBe(true);
  });
});
