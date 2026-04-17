import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { runGuard } from "../tools/guard/cli/run.js";
import { assessOpenSpec } from "../tools/control-plane/core/openspec.js";
import {
  createControlPlaneState,
  loadControlPlaneState,
  saveControlPlaneState,
} from "../tools/control-plane/state/store.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (root) => {
      await rm(root, { recursive: true, force: true });
    }),
  );
});

async function createWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "harness-control-plane-"));
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
      },
      null,
      2,
    ),
    "utf8",
  );
  return root;
}

describe("control plane state", () => {
  test("loads legacy state and persists split state files", async () => {
    const cwd = await createWorkspace();
    await writeFile(
      join(cwd, ".harness-state.json"),
      JSON.stringify(
        {
          current_stage: "implementation",
          approved_plan: true,
          openspec_ready: true,
          review1_passed: true,
          review2_last_status: "pass",
          local_run_confirmed: false,
          review3_passed: false,
          execution_mode: "role-based single-agent",
          adc_required: false,
          adc_completed: false,
          last_verification_claim: "ready",
          last_verification_evidence: [
            { command: "vitest", exit_code: 0, summary: "green" },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );

    const state = await loadControlPlaneState(cwd);
    expect(state.workflow.current_stage).toBe("implementation");
    expect(state.workflow.execution_mode).toBe("role-based single-agent");
    expect(state.session.primary_root).toBe(cwd);
    expect(state.evidence.verification_entries).toHaveLength(1);

    await saveControlPlaneState(cwd, state);

    const workflowFile = JSON.parse(
      await readFile(join(cwd, ".harness", "workflow-state.json"), "utf8"),
    );
    const evidenceFile = JSON.parse(
      await readFile(join(cwd, ".harness", "evidence-log.json"), "utf8"),
    );

    expect(workflowFile.current_stage).toBe("implementation");
    expect(evidenceFile.verification_entries[0].claim).toBe("ready");
  });
});

describe("session and context commands", () => {
  test("starts a session, attaches a reference root, and returns a snapshot", async () => {
    const cwd = await createWorkspace();
    const reference = join(cwd, "reference");
    await mkdir(reference, { recursive: true });

    const started = await runGuard(["session", "start"], { cwd });
    expect(started.status).toBe("PASS");

    const attached = await runGuard(
      ["session", "attach-root", "--role", "reference", "--path", reference],
      { cwd },
    );
    expect(attached.status).toBe("PASS");

    const snapshot = await runGuard(["context", "snapshot"], { cwd });
    expect(snapshot.status).toBe("PASS");
    const snap = snapshot.snapshot as Record<string, unknown>;
    expect(snap.primary_root).toBe(cwd);
    expect((snap.attached_reference_roots as string[])).toContain(reference);
    expect(snap).not.toHaveProperty("rust_architecture_concepts_to_borrow");
    expect(snap).not.toHaveProperty("excluded_capabilities");

    const skills = await runGuard(["skills"], { cwd });
    expect(skills.status).toBe("PASS");
    expect((skills as Record<string, unknown>).recommended_skills).toContain("brainstorming");
    expect((skills as Record<string, unknown>).workflow_hints).toEqual([
      "Recommended skills: brainstorming, writing-plans, deep-interview, ralplan",
    ]);

    const reviewSkills = await runGuard(["skills", "--stage", "review3"], { cwd });
    expect(reviewSkills.status).toBe("PASS");
    expect((reviewSkills as Record<string, unknown>).recommended_skills).toContain(
      "finishing-a-development-branch",
    );

    const localSkills = await runGuard(["skills", "--stage", "plan", "--source", "local"], { cwd });
    expect(localSkills.status).toBe("PASS");
    expect((localSkills as Record<string, unknown>).recommended_skills).toEqual([
      "brainstorming",
      "writing-plans",
    ]);

    const upstreamSkills = await runGuard(["skills", "--stage", "review3", "--source", "upstream"], { cwd });
    expect(upstreamSkills.status).toBe("PASS");
    expect((upstreamSkills as Record<string, unknown>).recommended_skills).toEqual([
      "verification-before-completion",
      "finishing-a-development-branch",
    ]);
  });

  test("rejects attaching a root outside the workspace", async () => {
    const cwd = await createWorkspace();
    const outsider = await mkdtemp(join(tmpdir(), "harness-outsider-"));
    tempRoots.push(outsider);

    const started = await runGuard(["session", "start"], { cwd });
    expect(started.status).toBe("PASS");

    const attached = await runGuard(
      ["session", "attach-root", "--role", "reference", "--path", outsider],
      { cwd },
    );

    expect(attached.status).toBe("BLOCK");
  });
});

describe("openspec policy", () => {
  test("recommends minimal artifacts for small local changes", () => {
    const decision = assessOpenSpec({
      complexity: "low",
      fileCount: 1,
      behaviorChange: false,
      taskCount: 1,
    });

    expect(decision.artifact_level).toBe("minimal");
    expect(decision.external_skill_recommended).toBe(false);
    expect(decision.review_gate_ready).toBe(true);
  });

  test("recommends fuller artifacts and optional external skill for larger changes", () => {
    const decision = assessOpenSpec({
      complexity: "medium",
      fileCount: 4,
      behaviorChange: true,
      taskCount: 3,
    });

    expect(decision.artifact_level).toBe("standard");
    expect(decision.external_skill_recommended).toBe(true);
    expect(decision.required_artifacts).toContain("design");
  });

  test("persists openspec assessments into the evidence log", async () => {
    const cwd = await createWorkspace();

    const result = await runGuard(
      ["openspec", "assess", "--complexity", "medium", "--file-count", "4", "--task-count", "3", "--behavior-change"],
      { cwd },
    );

    expect(result.status).toBe("PASS");

    const evidenceFile = JSON.parse(
      await readFile(join(cwd, ".harness", "evidence-log.json"), "utf8"),
    );
    expect(evidenceFile.openspec_decisions).toHaveLength(1);
    expect(evidenceFile.openspec_decisions[0].artifact_level).toBe("standard");
    expect(evidenceFile.openspec_decisions[0].behavior_change).toBe(true);
  });
});

describe("guard cli errors", () => {
  test("explains missing stage subcommands", async () => {
    const cwd = await createWorkspace();

    await expect(runGuard(["stage"], { cwd })).rejects.toThrow(/guard stage requires a subcommand/i);
  });

  test("explains missing review gate subcommands", async () => {
    const cwd = await createWorkspace();

    await expect(runGuard(["check"], { cwd })).rejects.toThrow(/guard check requires a review gate/i);
  });

  test("explains invalid requested execution modes", async () => {
    const cwd = await createWorkspace();

    await expect(
      runGuard(["decide-mode", "--requested-mode", "robot"], { cwd }),
    ).rejects.toThrow(/unsupported execution mode/i);
  });
});

describe("evidence log audit", () => {
  test("records mode and review decisions in the evidence log", async () => {
    const cwd = await createWorkspace();

    const initialized = await runGuard(
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
    expect(initialized.status).toBe("PASS");
    expect((initialized as Record<string, unknown>).recommended_skills).toContain("brainstorming");
    expect((initialized as Record<string, unknown>).workflow_hints).toEqual([
      "Recommended skills: brainstorming, writing-plans, deep-interview, ralplan",
    ]);

    const modeResult = await runGuard(["set-mode", "--mode", "role-based single-agent"], { cwd });
    expect(modeResult.status).toBe("PASS");
    expect((modeResult as Record<string, unknown>).recommended_skills).toContain("executing-plans");

    const reviewResult = await runGuard(["check", "review1"], { cwd });
    expect(reviewResult.status).toBe("BLOCK");
    expect((reviewResult as Record<string, unknown>).recommended_skills).toContain("verification-before-completion");

    const state = await loadControlPlaneState(cwd);
    expect(state.evidence.mode_decisions).toHaveLength(1);
    expect(state.evidence.mode_decisions[0].mode).toBe("role-based single-agent");
    expect(state.evidence.review_entries).toHaveLength(1);
    expect(state.evidence.review_entries[0].gate).toBe("review1");
    expect(state.evidence.review_entries[0].status).toBe("block");
  });
});
