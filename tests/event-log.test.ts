import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  const root = await mkdtemp(join(tmpdir(), "harness-event-log-"));
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
        current_stage: "plan",
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
  return root;
}

describe("event log", () => {
  test("records stage and review transitions", async () => {
    const cwd = await createWorkspace();

    const stageResult = await runGuard(
      [
        "stage",
        "plan",
        "--plan-field",
        "objective",
        "--plan-field",
        "scope",
        "--plan-field",
        "non_scope",
        "--plan-field",
        "acceptance_criteria",
        "--plan-field",
        "task_breakdown",
        "--plan-field",
        "validation_method",
      ],
      { cwd },
    );
    expect(stageResult.status).toBe("PASS");

    const reviewResult = await runGuard(["check", "review1"], { cwd });
    expect(reviewResult.status).toBe("BLOCK");

    const eventLog = (await readFile(join(cwd, ".harness", "event-log.jsonl"), "utf8"))
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(eventLog).toEqual(expect.any(Array));
    expect(eventLog[0]).toMatchObject({
      type: "stage_entered",
      stage: "plan",
    });
    expect(eventLog[1]).toMatchObject({
      type: "review_blocked",
      gate: "review1",
    });
  });

  test("event summary exposes counts and latest event", async () => {
    const cwd = await createWorkspace();

    await runGuard(
      [
        "stage",
        "plan",
        "--plan-field",
        "objective",
        "--plan-field",
        "scope",
        "--plan-field",
        "non_scope",
        "--plan-field",
        "acceptance_criteria",
        "--plan-field",
        "task_breakdown",
        "--plan-field",
        "validation_method",
      ],
      { cwd },
    );
    await runGuard(["check", "review1"], { cwd });

    const summary = await runGuard(["event", "summary"], { cwd });

    expect(summary.status).toBe("PASS");
    expect((summary as Record<string, unknown>).event_log_summary).toEqual(
      expect.objectContaining({
        total_events: 2,
        counts: expect.objectContaining({
          stage_entered: 1,
          review_blocked: 1,
        }),
        stage_distribution: expect.objectContaining({
          plan: 1,
        }),
        recent_events: expect.arrayContaining([
          expect.objectContaining({
            type: "stage_entered",
            stage: "plan",
          }),
          expect.objectContaining({
            type: "review_blocked",
            gate: "review1",
          }),
        ]),
        latest_event: expect.objectContaining({
          type: "review_blocked",
          gate: "review1",
        }),
      }),
    );
  });
});
