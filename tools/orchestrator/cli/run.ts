import { dispatchAuxiliaryCommand } from "../../control-plane/registry/commands.js";
import type { OrchestratorResult } from "../core/types.js";

export interface RunOrchestratorOptions {
  cwd: string;
}

export async function runOrchestrator(argv: string[], options: RunOrchestratorOptions): Promise<OrchestratorResult> {
  const result = await dispatchAuxiliaryCommand("orchestrator", argv, { cwd: options.cwd });
  if (!result) {
    throw new Error("Orchestrator command is required: validate, split, fallback, or run.");
  }
  return result as OrchestratorResult;
}
