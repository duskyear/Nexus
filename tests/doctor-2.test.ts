import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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

async function createWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "harness-doctor-2-"));
  tempRoots.push(root);

  await mkdir(join(root, "harness"), { recursive: true });
  await mkdir(join(root, ".harness"), { recursive: true });
  await mkdir(join(root, "skills"), { recursive: true });
  await writeFile(join(root, "skills", "alpha.md"), "# alpha\n", "utf8");
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "doctor-2", private: true }, null, 2), "utf8");
  await writeFile(join(root, "harness.version.json"), JSON.stringify({ version: 1 }, null, 2), "utf8");
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
  await writeFile(
    join(root, ".harness", "workflow-state.json"),
    JSON.stringify(
      {
        current_stage: "implementation",
        approved_plan: false,
        openspec_ready: false,
        review1_passed: false,
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
  await writeFile(
    join(root, ".harness", "runtime-context.json"),
    JSON.stringify(
      {
        resolved_instruction_files: [],
        relevant_paths: [],
        known_risks: [],
        open_questions: [],
        next_recommended_action: null,
        last_handoff: null,
        tool_calls_used: 8,
        review_count: 0,
        verification_count: 0,
        fallback_count: 0,
        retries_used: 0,
        stage_entered_at: null,
        session_started_at: null,
        elapsed_ms: 0,
        cap_warnings: 0,
        cap_blocks: 0,
      },
      null,
      2,
    ),
    "utf8",
  );

  return root;
}

describe("doctor 2.0", () => {
  test("returns structured summary and fixable items", async () => {
    const cwd = await createWorkspace();

    const result = await runGuard(["doctor"], { cwd });

    expect(result.status).toBe("WARN");
    expect((result as Record<string, unknown>).doctor_summary).toBeDefined();
    expect((result as Record<string, any>).doctor_summary.method_sources.status).toBe("WARN");
    expect((result as Record<string, any>).doctor_summary.workflow.status).toBe("WARN");
    expect((result as Record<string, any>).doctor_summary.runtime.status).toBe("WARN");
    expect((result as Record<string, unknown>).doctor_fixable_items).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/doctor --fix/i),
        expect.stringMatching(/implementation/i),
      ]),
    );
    expect((result as Record<string, unknown>).doctor_findings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/runtime caps/i),
      ]),
    );
  });
});
