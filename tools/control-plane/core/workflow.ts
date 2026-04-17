import type { GuardConfig, GuardStage } from "../../guard/schema/config.js";
import type { HarnessState } from "../../guard/schema/state.js";
import type { GuardResult } from "../../shared/types.js";

function createResult(result: GuardResult): GuardResult {
  return result;
}

export function evaluateStageTransition(
  config: GuardConfig,
  currentState: HarnessState | null,
  targetStage: GuardStage,
  options?: {
    planFields?: string[];
    highRiskChanges?: string[];
    confirmedHighRisk?: boolean;
    openspecReady?: string[];
  },
): { result: GuardResult; nextState?: HarnessState } {
  const providedPlanFields = new Set(options?.planFields ?? []);
  const missingPlanFields = config.required_plan_fields.filter((field) => !providedPlanFields.has(field));
  const requestedHighRiskChanges = options?.highRiskChanges ?? [];
  const unsupportedHighRiskChanges = requestedHighRiskChanges.filter(
    (change) => !config.high_risk_changes.includes(change),
  );

  if (unsupportedHighRiskChanges.length > 0) {
    return {
      result: createResult({
        status: "BLOCK",
        reason: `unknown high-risk changes requested: ${unsupportedHighRiskChanges.join(", ")}.`,
        evidence_checked: ["high_risk_changes"],
        next_step: "Use a configured high-risk change key before continuing.",
        stage: currentState?.current_stage ?? "plan",
      }),
    };
  }

  if (targetStage === "plan" && missingPlanFields.length > 0) {
    return {
      result: createResult({
        status: "BLOCK",
        reason: `missing required plan fields: ${missingPlanFields.join(", ")}.`,
        evidence_checked: ["required_plan_fields", "provided_plan_fields"],
        next_step: "Provide all required plan fields before entering the plan stage.",
        stage: currentState?.current_stage ?? "plan",
      }),
    };
  }

  if (targetStage === "plan" && requestedHighRiskChanges.length > 0 && !options?.confirmedHighRisk) {
    return {
      result: createResult({
        status: "BLOCK",
        reason: `high-risk changes require explicit confirmation before planning can continue: ${requestedHighRiskChanges.join(", ")}.`,
        evidence_checked: ["high_risk_changes", "confirmed_high_risk"],
        next_step: "Re-run stage plan with explicit high-risk confirmation after review.",
        stage: currentState?.current_stage ?? "plan",
      }),
    };
  }

  if (!currentState) {
    if (targetStage !== "plan") {
      return {
        result: createResult({
          status: "BLOCK",
          reason: `state must be initialized at plan before transitioning to ${targetStage}.`,
          evidence_checked: ["missing state file", "target stage"],
          next_step: "Run guard stage plan first to initialize workflow state.",
          stage: "plan",
        }),
      };
    }

    const nextState: HarnessState = {
      current_stage: targetStage,
      approved_plan: targetStage === "plan",
      openspec_ready: false,
      review1_passed: false,
      review2_last_status: "unknown",
      local_run_confirmed: false,
      review3_passed: false,
      execution_mode: config.execution_mode_rules.default,
      adc_required: false,
      adc_completed: false,
      last_verification_claim: null,
      last_verification_evidence: [],
    };

    return {
      result: createResult({
        status: "PASS",
        reason: `stage transition allowed: initialized state at ${targetStage}.`,
        evidence_checked: ["missing state file", "target stage"],
        next_step: "Continue through the documented stage sequence.",
        stage: targetStage,
      }),
      nextState,
    };
  }

  if (currentState.current_stage === targetStage) {
    return {
      result: createResult({
        status: "PASS",
        reason: `already in stage ${targetStage}.`,
        evidence_checked: ["current stage"],
        next_step: "Continue the current stage.",
        stage: targetStage,
      }),
      nextState: structuredClone(currentState),
    };
  }

  const allowedTargets = config.allowed_transitions[currentState.current_stage] ?? [];
  if (!allowedTargets.includes(targetStage)) {
    return {
      result: createResult({
        status: "BLOCK",
        reason: `stage transition from ${currentState.current_stage} to ${targetStage} is not allowed.`,
        evidence_checked: ["current stage", "allowed transitions"],
        next_step: `Move through one of the allowed transitions: ${allowedTargets.join(", ") || "none"}.`,
        stage: currentState.current_stage,
      }),
    };
  }

  if (targetStage === "openspec" && !currentState.approved_plan) {
    return {
      result: createResult({
        status: "BLOCK",
        reason: "openspec requires an approved plan before stage transition is allowed.",
        evidence_checked: ["current stage", "approved_plan"],
        next_step: "Approve the plan and then re-run stage openspec.",
        stage: currentState.current_stage,
      }),
    };
  }

  if (targetStage === "openspec") {
    const readinessChecks = new Set(options?.openspecReady ?? []);
    const requiredReadiness = ["proposal", "specs", "design", "tasks"];
    const missingReadiness = requiredReadiness.filter((item) => !readinessChecks.has(item));
    if (missingReadiness.length > 0) {
      return {
        result: createResult({
          status: "BLOCK",
          reason: `openspec readiness checks are missing: ${missingReadiness.join(", ")}.`,
          evidence_checked: ["approved_plan", "openspec_readiness"],
          next_step: "Provide proposal, specs, design, and tasks readiness inputs before entering openspec.",
          stage: currentState.current_stage,
        }),
      };
    }
  }

  const nextState = structuredClone(currentState);
  nextState.current_stage = targetStage;
  if (targetStage === "plan") {
    nextState.approved_plan = true;
  }
  if (targetStage === "openspec") {
    nextState.openspec_ready = true;
  }
  return {
    result: createResult({
      status: "PASS",
      reason: `stage transition allowed from ${currentState.current_stage} to ${targetStage}.`,
      evidence_checked: ["current stage", "allowed transitions"],
      next_step: "Proceed with the next required gate for this stage.",
      stage: targetStage,
    }),
    nextState,
  };
}

export function revertStage(
  config: GuardConfig,
  currentState: HarnessState,
  targetStage: GuardStage
): { result: GuardResult; nextState: HarnessState } {
  const orderedStages = config.stages;
  const currentIndex = orderedStages.indexOf(currentState.current_stage);
  const targetIndex = orderedStages.indexOf(targetStage);

  if (targetIndex >= currentIndex) {
    return {
      result: createResult({
        status: "BLOCK",
        reason: `cannot revert from ${currentState.current_stage} to ${targetStage}; target is not an earlier stage.`,
        evidence_checked: ["current stage", "target stage"],
        next_step: "Specify an earlier stage to revert to.",
        stage: currentState.current_stage,
      }),
      nextState: structuredClone(currentState),
    };
  }

  const nextState = structuredClone(currentState);
  nextState.current_stage = targetStage;

  if (targetIndex < orderedStages.indexOf("openspec")) nextState.openspec_ready = false;
  if (targetIndex < orderedStages.indexOf("review1")) nextState.review1_passed = false;
  if (targetIndex < orderedStages.indexOf("review2")) nextState.review2_last_status = "unknown";
  if (targetIndex < orderedStages.indexOf("local_run")) nextState.local_run_confirmed = false;
  if (targetIndex < orderedStages.indexOf("review3")) nextState.review3_passed = false;

  return {
    result: createResult({
      status: "PASS",
      reason: `stage successfully reverted from ${currentState.current_stage} to ${targetStage}.`,
      evidence_checked: ["current stage", "target stage"],
      next_step: "Please align your project's code/artifacts natively via git to match this reverted stage.",
      stage: targetStage,
    }),
    nextState,
  };
}

export function evaluateReview(
  reviewGate: "review1" | "review2" | "review3",
  currentState: HarnessState,
  options?: {
    scopeDrift?: boolean;
    designDrift?: boolean;
    modeDowngradeNeeded?: boolean;
    leftoverRisk?: boolean;
  },
): { result: GuardResult; nextState: HarnessState } {
  if (reviewGate === "review1") {
    if (currentState.current_stage !== "openspec" || !currentState.openspec_ready) {
      return {
        result: createResult({
          status: "BLOCK",
          reason: "review1 requires openspec stage with openspec_ready=true.",
          evidence_checked: ["current stage", "openspec_ready"],
          next_step: "Finish OpenSpec artifacts before review1.",
          stage: currentState.current_stage,
        }),
        nextState: structuredClone(currentState),
      };
    }

    return {
      result: createResult({
        status: "PASS",
        reason: "review1 prerequisites satisfied.",
        evidence_checked: ["current stage", "openspec_ready"],
        next_step: "Implementation may begin.",
        stage: "review1",
      }),
      nextState: {
        ...structuredClone(currentState),
        current_stage: "review1",
        review1_passed: true,
      },
    };
  }

  if (reviewGate === "review3") {
    if (currentState.current_stage !== "local_run" || !currentState.local_run_confirmed) {
      return {
        result: createResult({
          status: "BLOCK",
          reason: "review3 requires local_run stage with local_run_confirmed=true.",
          evidence_checked: ["current stage", "local_run_confirmed"],
          next_step: "Run local validation and confirm it before review3.",
          stage: currentState.current_stage,
        }),
        nextState: structuredClone(currentState),
      };
    }

    if (options?.leftoverRisk) {
      return {
        result: createResult({
          status: "WARN",
          reason: "review3 detected leftover delivery risk; work is only conditionally deliverable.",
          evidence_checked: ["current stage", "local_run_confirmed", "leftover_risk"],
          next_step: "Resolve or explicitly accept the leftover risk before delivery.",
          stage: "review3",
        }),
        nextState: {
          ...structuredClone(currentState),
          current_stage: "review3",
          review3_passed: false,
        },
      };
    }

    return {
      result: createResult({
        status: "PASS",
        reason: "review3 prerequisites satisfied.",
        evidence_checked: ["current stage", "local_run_confirmed"],
        next_step: "Delivery claim may be evaluated with fresh verification evidence.",
        stage: "review3",
      }),
      nextState: {
        ...structuredClone(currentState),
        current_stage: "review3",
        review3_passed: true,
      },
    };
  }

  if (currentState.current_stage !== "implementation" && currentState.current_stage !== "review2") {
    return {
      result: createResult({
        status: "WARN",
        reason: "review2 usually runs during implementation and has limited evidence outside that stage.",
        evidence_checked: ["current stage"],
        next_step: "Run review2 during implementation when drift or blockers appear.",
        stage: currentState.current_stage,
      }),
      nextState: {
        ...structuredClone(currentState),
        review2_last_status: "warn",
      },
    };
  }

  if (options?.modeDowngradeNeeded) {
    return {
      result: createResult({
        status: "BLOCK",
        reason: "execution mode downgrade is required before implementation can continue.",
        evidence_checked: ["current stage", "execution_mode", "mode_downgrade_needed"],
        next_step: "Downgrade execution mode and re-check review2.",
        stage: currentState.current_stage,
      }),
      nextState: {
        ...structuredClone(currentState),
        review2_last_status: "block",
      },
    };
  }

  if (options?.scopeDrift || options?.designDrift) {
    const driftReason = options.scopeDrift ? "scope drift" : "design drift";
    return {
      result: createResult({
        status: "WARN",
        reason: `review2 detected ${driftReason}; correction is recommended before continuing.`,
        evidence_checked: [
          "current stage",
          options.scopeDrift ? "scope_drift" : "design_drift",
        ],
        next_step: "Correct course or confirm the drift before continuing implementation.",
        stage: currentState.current_stage,
      }),
      nextState: {
        ...structuredClone(currentState),
        current_stage: "review2",
        review2_last_status: "warn",
      },
    };
  }

  return {
    result: createResult({
      status: "PASS",
      reason: "review2 completed with no blocking drift detected.",
      evidence_checked: ["current stage"],
      next_step: "Continue implementation or move to local_run when ready.",
      stage: "review2",
    }),
    nextState: {
      ...structuredClone(currentState),
      current_stage: "review2",
      review2_last_status: "pass",
    },
  };
}

export function recordLocalRun(state: HarnessState): { result: GuardResult; nextState: HarnessState } {
  if (state.current_stage !== "local_run") {
    return {
      result: createResult({
        status: "BLOCK",
        reason: "local run can only be recorded during the local_run stage.",
        evidence_checked: ["current stage"],
        next_step: "Move to local_run before recording local validation.",
        stage: state.current_stage,
      }),
      nextState: structuredClone(state),
    };
  }

  return {
    result: createResult({
      status: "PASS",
      reason: "local run confirmation recorded.",
      evidence_checked: ["current stage"],
      next_step: "Proceed to review3 when delivery review is ready.",
      stage: state.current_stage,
    }),
    nextState: {
      ...state,
      local_run_confirmed: true,
    },
  };
}
