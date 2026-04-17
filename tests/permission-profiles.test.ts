import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { runGuard } from "../tools/guard/cli/run.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (root) => {
      await rm(root, { recursive: true, force: true });
    }),
  );
});

async function createWorkspace(stage: "review1" | "implementation"): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "harness-permissions-"));
  tempRoots.push(root);

  await mkdir(join(root, "harness"), { recursive: true });
  await mkdir(join(root, ".harness"), { recursive: true });

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
        high_risk_changes: [
          "major_dependencies",
          "architecture_changes",
          "schema_changes",
          "public_api_changes",
          "unrelated_refactors",
        ],
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
        current_stage: stage,
        approved_plan: true,
        openspec_ready: true,
        review1_passed: stage !== "review1",
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

describe("permission profiles", () => {
  test("skills reflects the active stage permission profile", async () => {
    const reviewOne = await createWorkspace("review1");

    const reviewOneResult = await runGuard(["skills"], { cwd: reviewOne });
    expect(reviewOneResult.status).toBe("PASS");
    expect((reviewOneResult as Record<string, unknown>).permission_profile).toBe("read-only");

    const implementation = await createWorkspace("implementation");
    const implementationResult = await runGuard(["skills"], { cwd: implementation });
    expect(implementationResult.status).toBe("PASS");
    expect((implementationResult as Record<string, unknown>).permission_profile).toBe("workspace-write");
  });

  test("set-mode blocks multi-agent when the active stage is read-only", async () => {
    const workspace = await createWorkspace("review1");

    const result = await runGuard(
      [
        "set-mode",
        "--mode",
        "multi-agent",
        "--complexity",
        "high",
        "--approved-plan",
        "--independent-subtasks",
        "--reduced-context-pollution",
      ],
      { cwd: workspace },
    );

    expect(result.status).toBe("BLOCK");
    expect(result.reason).toMatch(/read-only/i);
    expect((result as Record<string, unknown>).permission_profile).toBe("read-only");
  });
});
