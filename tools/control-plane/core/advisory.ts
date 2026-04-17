import type { HarnessState } from "../../guard/schema/state.js";
import type { ExecutionMode } from "../../guard/schema/config.js";
import type { OrchestratorResult } from "../../shared/types.js";

export function validateOrchestration(state: HarnessState): OrchestratorResult {
  if (!state.approved_plan || !state.adc_completed || state.execution_mode !== "multi-agent") {
    return {
      status: "BLOCK",
      reason: "multi-agent orchestration is not eligible without an approved plan, completed ADC, and multi-agent mode.",
      next_step: "Stay on single-agent or role-based single-agent until the prerequisites are complete.",
    };
  }

  return {
    status: "PASS",
    reason: "multi-agent prerequisites are satisfied.",
    next_step: "You may split the work into independent subtasks.",
    execution_mode: state.execution_mode,
  };
}

export function splitSubtasks(parallelizable: string[], nonParallelizable: string[]): OrchestratorResult {
  return {
    status: "PASS",
    reason: "Subtask split generated.",
    next_step: "Review the boundaries before enabling workers.",
    parallelizable,
    non_parallelizable: nonParallelizable,
  };
}

export function fallbackExecutionMode(
  state: HarnessState,
  target: ExecutionMode,
): { result: OrchestratorResult; nextState: HarnessState } {
  const nextState = structuredClone(state);
  nextState.execution_mode = target;
  nextState.adc_required = target === "multi-agent";
  nextState.adc_completed = target === "multi-agent" ? state.adc_completed : false;

  return {
    result: {
      status: "PASS",
      reason: `Execution mode downgraded to ${target}.`,
      next_step: "Continue using the simpler execution mode.",
      execution_mode: target,
    },
    nextState,
  };
}

export function runOrchestrationPlan(parallelizable: string[], nonParallelizable: string[]): OrchestratorResult {
  return {
    status: "PASS",
    reason: "Controlled orchestration plan generated.",
    next_step: "Review the lead and worker ownership before executing real agents.",
    lead: nonParallelizable,
    workers: parallelizable,
    fallback: "Downgrade to role-based single-agent if boundaries collapse or coordination cost rises.",
    caps: [
      "max_subagents",
      "max_tool_calls",
      "max_retries",
      "max_runtime",
      "max_token_budget",
    ],
    stop_conditions: [
      "context pollution",
      "duplicated work",
      "coordination cost exceeds value",
      "caps exceeded",
      "fallback not viable",
    ],
  };
}
