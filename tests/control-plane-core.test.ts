import { describe, expect, test } from "vitest";

import { defaultRuntimeCaps, type GuardConfig } from "../tools/guard/schema/config.js";
import type { HarnessState } from "../tools/guard/schema/state.js";
import { evaluateStageTransition, evaluateReview, recordLocalRun } from "../tools/control-plane/core/workflow.js";
import { applyExecutionMode, decideMode } from "../tools/control-plane/core/mode.js";
import { evaluateClaim, withVerificationRecorded } from "../tools/control-plane/core/verification.js";
import {
  applyLegacyHarnessState,
  createControlPlaneState,
  toLegacyHarnessState,
} from "../tools/control-plane/state/store.js";

const config: GuardConfig = {
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
    multi_agent_requires: ["approved_plan", "independent_subtasks", "reduced_context_pollution"],
  },
  skill_triggers: {
    debugging: "systematic-debugging",
    behavior_change: "test-driven-development",
    completion_claim: "verification-before-completion",
    independent_subtasks: "subagent-driven-development",
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
  runtime_caps: defaultRuntimeCaps,
};

function createState(overrides: Partial<HarnessState> = {}): HarnessState {
  return {
    current_stage: "plan",
    approved_plan: false,
    openspec_ready: false,
    review1_passed: false,
    review2_last_status: "unknown",
    local_run_confirmed: false,
    review3_passed: false,
    execution_mode: "single-agent",
    adc_required: false,
    adc_completed: false,
    last_verification_claim: null,
    last_verification_evidence: [],
    ...overrides,
  };
}

describe("mode policy", () => {
  test("returns role-based single-agent for medium complexity work", () => {
    const result = decideMode(config, { complexity: "medium" });
    expect(result.status).toBe("PASS");
    expect(result.execution_mode).toBe("role-based single-agent");
  });

  test("blocks multi-agent enablement until prerequisites are satisfied", () => {
    const state = createState({ current_stage: "implementation" });
    const evaluated = applyExecutionMode(config, state, {
      mode: "multi-agent",
      complexity: "medium",
    });

    expect(evaluated.result.status).toBe("BLOCK");
    expect(evaluated.nextState.execution_mode).toBe("single-agent");
  });

  test("clones state when multi-agent enablement is blocked", () => {
    const state = createState({ current_stage: "implementation" });
    const evaluated = applyExecutionMode(config, state, {
      mode: "multi-agent",
      complexity: "medium",
    });

    expect(evaluated.result.status).toBe("BLOCK");
    expect(evaluated.nextState).not.toBe(state);
  });
});

describe("verification policy", () => {
  test("requires structured evidence before a completion claim passes", () => {
    const result = evaluateClaim(config, {
      claim: "ready",
      evidenceItems: [],
      evidenceCount: 0,
      evidenceAligned: true,
    });

    expect(result.status).toBe("BLOCK");
  });

  test("records verification claim and evidence on state", () => {
    const state = withVerificationRecorded(createState(), {
      claim: "ready",
      evidenceItems: [{ command: "vitest", exit_code: 0, summary: "green" }],
    });

    expect(state.last_verification_claim).toBe("ready");
    expect(state.last_verification_evidence).toHaveLength(1);
  });
});

describe("workflow policy", () => {
  test("requires approved plan and readiness before entering openspec", () => {
    const result = evaluateStageTransition(config, createState({ approved_plan: false }), "openspec", {
      openspecReady: ["proposal", "specs", "design", "tasks"],
    });

    expect(result.result.status).toBe("BLOCK");
  });

  test("passes review1 only from ready openspec state", () => {
    const evaluated = evaluateReview("review1", createState({
      current_stage: "openspec",
      openspec_ready: true,
      approved_plan: true,
    }));

    expect(evaluated.result.status).toBe("PASS");
    expect(evaluated.nextState.review1_passed).toBe(true);
  });

  test("records local run only from local_run stage", () => {
    const evaluated = recordLocalRun(createState({ current_stage: "local_run" }));
    expect(evaluated.result.status).toBe("PASS");
    expect(evaluated.nextState.local_run_confirmed).toBe(true);
  });

  test("clones state when stage transition is a no-op", () => {
    const state = createState({ current_stage: "openspec", approved_plan: true, openspec_ready: true });
    const evaluated = evaluateStageTransition(config, state, "openspec");

    expect(evaluated.result.status).toBe("PASS");
    expect(evaluated.nextState).not.toBe(state);
  });

  test("clones state when review1 is blocked", () => {
    const state = createState({ current_stage: "plan" });
    const evaluated = evaluateReview("review1", state);

    expect(evaluated.result.status).toBe("BLOCK");
    expect(evaluated.nextState).not.toBe(state);
  });
});

describe("legacy migration", () => {
  test("preserves review3 status when round-tripping through legacy state", () => {
    const current = createControlPlaneState("/workspace");
    current.workflow.review3_status = "block";
    current.workflow.delivery_status = "not_deliverable";

    const legacy = toLegacyHarnessState(current);
    const next = applyLegacyHarnessState(current, legacy);

    expect(next.workflow.review3_status).toBe("block");
    expect(next.workflow.delivery_status).toBe("not_deliverable");
  });
});
