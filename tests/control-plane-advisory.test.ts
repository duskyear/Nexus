import { describe, expect, test } from "vitest";
import { access, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { HarnessState } from "../tools/guard/schema/state.js";
import { createInitialState } from "../tools/guard/schema/state.js";
import {
  fallbackExecutionMode,
  runOrchestrationPlan,
  splitSubtasks,
  validateOrchestration,
} from "../tools/control-plane/core/advisory.js";
import { runTemplate } from "../tools/templates/cli/run.js";
import { runOrchestrator } from "../tools/orchestrator/cli/run.js";
import { saveState } from "../tools/guard/state/store.js";
import { dispatchAuxiliaryCommand } from "../tools/control-plane/registry/commands.js";

function createState(overrides: Partial<HarnessState> = {}): HarnessState {
  return {
    current_stage: "implementation",
    approved_plan: true,
    openspec_ready: true,
    review1_passed: true,
    review2_last_status: "unknown",
    local_run_confirmed: false,
    review3_passed: false,
    execution_mode: "multi-agent",
    adc_required: true,
    adc_completed: true,
    last_verification_claim: null,
    last_verification_evidence: [],
    ...overrides,
  };
}

describe("orchestration advisory", () => {
  test("validates multi-agent orchestration only when prerequisites are satisfied", () => {
    const pass = validateOrchestration(createState());
    expect(pass.status).toBe("PASS");

    const block = validateOrchestration(createState({ adc_completed: false }));
    expect(block.status).toBe("BLOCK");
  });

  test("builds split and fallback advisory without running agents", () => {
    const split = splitSubtasks(["docs", "tests"], ["schema"]);
    expect(split.parallelizable).toEqual(["docs", "tests"]);

    const fallback = fallbackExecutionMode(createState(), "role-based single-agent");
    expect(fallback.result.execution_mode).toBe("role-based single-agent");

    const run = runOrchestrationPlan(["docs", "tests"], ["schema"]);
    expect(run.workers).toEqual(["docs", "tests"]);
    expect(run.lead).toEqual(["schema"]);
  });

  test("explains missing template and orchestrator commands", async () => {
    const root = await mkdtemp(join(tmpdir(), "command-errors-"));
    try {
      await mkdir(join(root, "harness"), { recursive: true });
      await writeFile(
        join(root, "harness", "guard.config.json"),
        JSON.stringify(
          {
            version: 1,
            stages: ["plan", "openspec", "review1", "implementation", "review2", "local_run", "review3", "hardening"],
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
            required_plan_fields: ["objective", "scope", "non_scope", "acceptance_criteria", "task_breakdown", "validation_method"],
            execution_mode_rules: {
              default: "single-agent",
              medium_complexity: "role-based single-agent",
              multi_agent_requires: ["approved_plan", "independent_subtasks", "reduced_context_pollution"],
            },
            skill_triggers: {
              debugging: "systematic-debugging",
              behavior_change: "test-driven-development",
              completion_claim: "verification-before-completion",
              independent_subtasks: "subagent-driven-development",
            },
            high_risk_changes: ["major_dependencies", "architecture_changes", "schema_changes", "public_api_changes", "unrelated_refactors"],
            review_gates: ["review1", "review2", "review3"],
            claim_keywords: ["complete", "fixed", "passing", "ready", "deliverable"],
          },
          null,
          2,
        ),
        "utf8",
      );

      await expect(runTemplate([], { cwd: root })).rejects.toThrow(/template command is required/i);
      await expect(runOrchestrator([], { cwd: root })).rejects.toThrow(/orchestrator command is required/i);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("template openspec enrichment", () => {
  test("uses lightweight openspec guidance for low-complexity work", async () => {
    const root = await mkdtemp(join(tmpdir(), "template-openspec-"));
    try {
      await mkdir(join(root, "harness"), { recursive: true });
      await writeFile(
        join(root, "harness", "guard.config.json"),
        JSON.stringify(
          {
            version: 1,
            stages: ["plan", "openspec", "review1", "implementation", "review2", "local_run", "review3", "hardening"],
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
            required_plan_fields: ["objective", "scope", "non_scope", "acceptance_criteria", "task_breakdown", "validation_method"],
            execution_mode_rules: {
              default: "single-agent",
              medium_complexity: "role-based single-agent",
              multi_agent_requires: ["approved_plan", "independent_subtasks", "reduced_context_pollution"],
            },
            skill_triggers: {
              debugging: "systematic-debugging",
              behavior_change: "test-driven-development",
              completion_claim: "verification-before-completion",
              independent_subtasks: "subagent-driven-development",
            },
            high_risk_changes: ["major_dependencies", "architecture_changes", "schema_changes", "public_api_changes", "unrelated_refactors"],
            review_gates: ["review1", "review2", "review3"],
            claim_keywords: ["complete", "fixed", "passing", "ready", "deliverable"],
          },
          null,
          2,
        ),
        "utf8",
      );

      const template = await runTemplate(
        ["stage", "openspec", "--complexity", "low", "--file-count", "1", "--task-count", "1"],
        { cwd: root },
      );

      expect(template.content).toContain("artifact level: minimal");
      expect(template.content).toContain("A lightweight spec artifact is sufficient");
      expect(template.content).toContain("spec-note");
      expect(template.content).toContain("Recommended skills");
      expect(template.content).toContain("writing-plans");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("switches openspec template body for fuller artifact levels", async () => {
    const root = await mkdtemp(join(tmpdir(), "template-openspec-"));
    try {
      await mkdir(join(root, "harness"), { recursive: true });
      await writeFile(
        join(root, "harness", "guard.config.json"),
        JSON.stringify(
          {
            version: 1,
            stages: ["plan", "openspec", "review1", "implementation", "review2", "local_run", "review3", "hardening"],
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
            required_plan_fields: ["objective", "scope", "non_scope", "acceptance_criteria", "task_breakdown", "validation_method"],
            execution_mode_rules: {
              default: "single-agent",
              medium_complexity: "role-based single-agent",
              multi_agent_requires: ["approved_plan", "independent_subtasks", "reduced_context_pollution"],
            },
            skill_triggers: {
              debugging: "systematic-debugging",
              behavior_change: "test-driven-development",
              completion_claim: "verification-before-completion",
              independent_subtasks: "subagent-driven-development",
            },
            high_risk_changes: ["major_dependencies", "architecture_changes", "schema_changes", "public_api_changes", "unrelated_refactors"],
            review_gates: ["review1", "review2", "review3"],
            claim_keywords: ["complete", "fixed", "passing", "ready", "deliverable"],
          },
          null,
          2,
        ),
        "utf8",
      );

      const template = await runTemplate(
        ["stage", "openspec", "--complexity", "high", "--file-count", "8", "--task-count", "5", "--behavior-change"],
        { cwd: root },
      );

      expect(template.content).toContain("artifact level: full");
      expect(template.content).toContain("specs/");
      expect(template.content).not.toContain("spec-note, validation");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("adds recommended skills to review and verification templates", async () => {
    const root = await mkdtemp(join(tmpdir(), "template-skills-"));
    try {
      await mkdir(join(root, "harness"), { recursive: true });
      await writeFile(
        join(root, "harness", "guard.config.json"),
        JSON.stringify(
          {
            version: 1,
            stages: ["plan", "openspec", "review1", "implementation", "review2", "local_run", "review3", "hardening"],
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
            required_plan_fields: ["objective", "scope", "non_scope", "acceptance_criteria", "task_breakdown", "validation_method"],
            execution_mode_rules: {
              default: "single-agent",
              medium_complexity: "role-based single-agent",
              multi_agent_requires: ["approved_plan", "independent_subtasks", "reduced_context_pollution"],
            },
            skill_triggers: {
              debugging: "systematic-debugging",
              behavior_change: "test-driven-development",
              completion_claim: "verification-before-completion",
              independent_subtasks: "subagent-driven-development",
            },
            high_risk_changes: ["major_dependencies", "architecture_changes", "schema_changes", "public_api_changes", "unrelated_refactors"],
            review_gates: ["review1", "review2", "review3"],
            claim_keywords: ["complete", "fixed", "passing", "ready", "deliverable"],
          },
          null,
          2,
        ),
        "utf8",
      );

      const reviewTemplate = await runTemplate(["check", "review3"], { cwd: root });
      expect(reviewTemplate.content).toContain("Recommended skills");
      expect(reviewTemplate.content).toContain("finishing-a-development-branch");

      const verifyTemplate = await runTemplate(["verify-claim"], { cwd: root });
      expect(verifyTemplate.content).toContain("verification-before-completion");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("state write path and registry dispatch", () => {
  test("saveState writes new control-plane state without requiring legacy state writes", async () => {
    const root = await mkdtemp(join(tmpdir(), "state-write-"));
    try {
      await mkdir(join(root, "harness"), { recursive: true });
      await writeFile(
        join(root, "harness", "guard.config.json"),
        JSON.stringify(
          {
            version: 1,
            stages: ["plan", "openspec", "review1", "implementation", "review2", "local_run", "review3", "hardening"],
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
            required_plan_fields: ["objective", "scope", "non_scope", "acceptance_criteria", "task_breakdown", "validation_method"],
            execution_mode_rules: {
              default: "single-agent",
              medium_complexity: "role-based single-agent",
              multi_agent_requires: ["approved_plan", "independent_subtasks", "reduced_context_pollution"],
            },
            skill_triggers: {
              debugging: "systematic-debugging",
              behavior_change: "test-driven-development",
              completion_claim: "verification-before-completion",
              independent_subtasks: "subagent-driven-development",
            },
            high_risk_changes: ["major_dependencies", "architecture_changes", "schema_changes", "public_api_changes", "unrelated_refactors"],
            review_gates: ["review1", "review2", "review3"],
            claim_keywords: ["complete", "fixed", "passing", "ready", "deliverable"],
          },
          null,
          2,
        ),
        "utf8",
      );

      await saveState(root, createInitialState());

      await expect(access(join(root, ".harness", "workflow-state.json"), constants.F_OK)).resolves.toBeUndefined();
      await expect(access(join(root, ".harness-state.json"), constants.F_OK)).rejects.toBeTruthy();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("dispatches auxiliary orchestrator and template commands through shared registry", async () => {
    const root = await mkdtemp(join(tmpdir(), "dispatch-"));
    try {
      await mkdir(join(root, "harness"), { recursive: true });
      await writeFile(
        join(root, "harness", "guard.config.json"),
        JSON.stringify(
          {
            version: 1,
            stages: ["plan", "openspec", "review1", "implementation", "review2", "local_run", "review3", "hardening"],
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
            required_plan_fields: ["objective", "scope", "non_scope", "acceptance_criteria", "task_breakdown", "validation_method"],
            execution_mode_rules: {
              default: "single-agent",
              medium_complexity: "role-based single-agent",
              multi_agent_requires: ["approved_plan", "independent_subtasks", "reduced_context_pollution"],
            },
            skill_triggers: {
              debugging: "systematic-debugging",
              behavior_change: "test-driven-development",
              completion_claim: "verification-before-completion",
              independent_subtasks: "subagent-driven-development",
            },
            high_risk_changes: ["major_dependencies", "architecture_changes", "schema_changes", "public_api_changes", "unrelated_refactors"],
            review_gates: ["review1", "review2", "review3"],
            claim_keywords: ["complete", "fixed", "passing", "ready", "deliverable"],
          },
          null,
          2,
        ),
        "utf8",
      );

      const templateDispatch = await dispatchAuxiliaryCommand(
        "template",
        ["stage", "openspec", "--complexity", "low", "--file-count", "1", "--task-count", "1"],
        { cwd: root },
      );
      expect(templateDispatch?.content).toContain("artifact level: minimal");

      const advisoryDispatch = await dispatchAuxiliaryCommand(
        "orchestrator",
        ["split", "--parallelizable", "docs", "--sequential", "schema"],
        { cwd: root },
      );
      expect(advisoryDispatch?.parallelizable).toEqual(["docs"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
