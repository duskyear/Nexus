import {
  resolvePermissionProfileForStage,
  type ExecutionMode,
  type GuardConfig,
} from "../../guard/schema/config.js";
import type { HarnessState } from "../../guard/schema/state.js";
import type { GuardResult } from "../../shared/types.js";

function createResult(result: GuardResult): GuardResult {
  return result;
}

export function decideMode(
  config: GuardConfig,
  options: {
    complexity?: string;
    approvedPlan?: boolean;
    independentSubtasks?: boolean;
    reducedContextPollution?: boolean;
    requestedMode?: ExecutionMode;
  },
): GuardResult {
  const complexity = options.complexity ?? "low";

  if (options.requestedMode === "multi-agent" && complexity !== "high") {
    return createResult({
      status: "WARN",
      reason: "multi-agent was requested for work that does not justify orchestration; falling back to single-agent.",
      evidence_checked: ["requested_mode", "complexity"],
      next_step: "Use single-agent or re-run decide-mode with stronger multi-agent evidence.",
      execution_mode: config.execution_mode_rules.default,
    });
  }

  if (
    complexity === "high" &&
    options.approvedPlan &&
    options.independentSubtasks &&
    options.reducedContextPollution
  ) {
    return createResult({
      status: "PASS",
      reason: "high complexity with approved plan and independent subtasks justifies multi-agent",
      evidence_checked: config.execution_mode_rules.multi_agent_requires,
      next_step: "Complete AGENT_DESIGN_CARD before enabling multi-agent orchestration.",
      execution_mode: "multi-agent",
    });
  }

  if (complexity === "medium") {
    return createResult({
      status: "PASS",
      reason: "medium complexity work defaults to role-based single-agent.",
      evidence_checked: ["complexity"],
      next_step: "Proceed with a role-based single-agent implementation plan.",
      execution_mode: config.execution_mode_rules.medium_complexity,
    });
  }

  return createResult({
    status: "PASS",
    reason: "low complexity work stays on the default single-agent mode.",
    evidence_checked: ["complexity"],
    next_step: "Proceed with single-agent execution.",
    execution_mode: config.execution_mode_rules.default,
  });
}

export function isExecutionMode(value: string): value is ExecutionMode {
  return value === "single-agent" || value === "role-based single-agent" || value === "multi-agent";
}

export function applyExecutionMode(
  config: GuardConfig,
  state: HarnessState,
  options: {
    mode?: ExecutionMode;
    complexity?: string;
    approvedPlan?: boolean;
    independentSubtasks?: boolean;
    reducedContextPollution?: boolean;
  },
): { result: GuardResult; nextState: HarnessState } {
  const mode = options.mode;
  if (!mode) {
    return {
      result: createResult({
        status: "BLOCK",
        reason: "execution mode is required.",
        evidence_checked: ["mode"],
        next_step: "Re-run set-mode with a supported execution mode.",
        stage: state.current_stage,
      }),
      nextState: structuredClone(state),
    };
  }

  if (mode === "multi-agent") {
    const permissionProfile = resolvePermissionProfileForStage(config, state.current_stage);
    if (permissionProfile === "read-only") {
      return {
        result: createResult({
          status: "BLOCK",
          reason: `multi-agent mode cannot be enabled while ${state.current_stage} is configured for ${permissionProfile}.`,
          evidence_checked: ["permission_profile", "current stage"],
          next_step: "Move to a write-enabled stage before enabling multi-agent mode.",
          stage: state.current_stage,
          permission_profile: permissionProfile,
        }),
        nextState: structuredClone(state),
      };
    }

    const modeDecision = decideMode(config, {
      complexity: options.complexity,
      approvedPlan: options.approvedPlan ?? state.approved_plan,
      independentSubtasks: options.independentSubtasks,
      reducedContextPollution: options.reducedContextPollution,
      requestedMode: "multi-agent",
    });

    if (modeDecision.execution_mode !== "multi-agent" || modeDecision.status !== "PASS") {
      return {
        result: createResult({
          status: "BLOCK",
          reason: "multi-agent mode cannot be enabled until approved plan and orchestration prerequisites are satisfied.",
          evidence_checked: modeDecision.evidence_checked,
          next_step: "Provide approved plan, independent subtasks, reduced context pollution, and high complexity evidence.",
          stage: state.current_stage,
          permission_profile: permissionProfile,
        }),
        nextState: structuredClone(state),
      };
    }
  }

  const nextState = structuredClone(state);
  nextState.execution_mode = mode;
  nextState.adc_required = mode === "multi-agent";
  nextState.adc_completed = mode === "multi-agent" ? state.adc_completed : false;

  return {
    result: createResult({
    status: "PASS",
    reason: `execution mode set to ${mode}.`,
    evidence_checked: mode === "multi-agent" ? config.execution_mode_rules.multi_agent_requires : ["mode"],
    next_step: mode === "multi-agent" ? "Complete and record AGENT_DESIGN_CARD before orchestration." : "Proceed with the selected execution mode.",
    execution_mode: mode,
    stage: state.current_stage,
    permission_profile: resolvePermissionProfileForStage(config, state.current_stage),
  }),
  nextState,
  };
}
