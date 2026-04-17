export {
  applyExecutionMode,
  decideMode,
  isExecutionMode,
} from "../../control-plane/core/mode.js";
export {
  evaluateClaim,
  withVerificationRecorded,
} from "../../control-plane/core/verification.js";
export {
  evaluateReview,
  evaluateStageTransition,
  revertStage,
  recordLocalRun,
} from "../../control-plane/core/workflow.js";

import type { GuardResult } from "./types.js";
import type { HarnessState } from "../schema/state.js";

function createResult(result: GuardResult): GuardResult {
  return result;
}

export function recordAdcCompletion(
  state: HarnessState,
  options: { adcExists: boolean; adcMeaningful: boolean },
): { result: GuardResult; nextState: HarnessState } {
  if (!state.adc_required) {
    return {
      result: createResult({
        status: "BLOCK",
        reason: "ADC completion can only be recorded when multi-agent mode requires an ADC.",
        evidence_checked: ["adc_required"],
        next_step: "Enable multi-agent mode before recording ADC completion.",
        stage: state.current_stage,
      }),
      nextState: state,
    };
  }

  if (!options.adcExists) {
    return {
      result: createResult({
        status: "BLOCK",
        reason: "ADC file is missing.",
        evidence_checked: ["adc_exists"],
        next_step: "Create harness/AGENT_DESIGN_CARD.md before recording ADC completion.",
        stage: state.current_stage,
      }),
      nextState: state,
    };
  }

  if (!options.adcMeaningful) {
    return {
      result: createResult({
        status: "BLOCK",
        reason: "ADC file still contains placeholder content and cannot be marked complete.",
        evidence_checked: ["adc_exists", "adc_meaningful"],
        next_step: "Replace placeholder ADC content with a real design card, then re-run the record command.",
        stage: state.current_stage,
      }),
      nextState: state,
    };
  }

  return {
    result: createResult({
      status: "PASS",
      reason: "ADC completion recorded.",
      evidence_checked: ["adc_required", "adc_exists", "adc_meaningful"],
      next_step: "Run orchestrator validate before multi-agent execution.",
      stage: state.current_stage,
    }),
    nextState: {
      ...state,
      adc_completed: true,
    },
  };
}
