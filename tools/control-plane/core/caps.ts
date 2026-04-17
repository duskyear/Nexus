import type { RuntimeContext } from "../schema/runtime-context.js";
import { defaultRuntimeCaps, type RuntimeCapsConfig } from "../../guard/schema/config.js";
import type { GuardResult, GuardStatus } from "../../shared/types.js";

export interface RuntimeCapReport {
  status: GuardStatus;
  reason: string;
  evidence_checked: string[];
  next_step: string;
  cap_warnings: string[];
  cap_blocks: string[];
}

function maxSeverity(current: GuardStatus, next: GuardStatus): GuardStatus {
  if (current === "BLOCK" || next === "BLOCK") {
    return "BLOCK";
  }

  if (current === "WARN" || next === "WARN") {
    return "WARN";
  }

  return "PASS";
}

type RuntimeCapField = keyof RuntimeCapsConfig;

function describeCap(field: RuntimeCapField, threshold: number, kind: "warn" | "block"): string {
  return `${field} ${kind} threshold ${threshold}`;
}

export function evaluateRuntimeCaps(
  runtime: RuntimeContext,
  thresholds: RuntimeCapsConfig = defaultRuntimeCaps,
): RuntimeCapReport {
  const warnings: string[] = [];
  const blocks: string[] = [];
  let status: GuardStatus = "PASS";

  for (const [field, threshold] of Object.entries(thresholds) as Array<[RuntimeCapField, { warn: number; block: number }]>) {
    const value = runtime[field];
    if (value >= threshold.block) {
      blocks.push(describeCap(field, threshold.block, "block"));
      status = maxSeverity(status, "BLOCK");
      continue;
    }

    if (value >= threshold.warn) {
      warnings.push(describeCap(field, threshold.warn, "warn"));
      status = maxSeverity(status, "WARN");
    }
  }

  if (blocks.length > 0) {
    return {
      status: "BLOCK",
      reason: `runtime caps exceeded: ${blocks.join(", ")}.`,
      evidence_checked: ["runtime_context", "runtime_caps"],
      next_step: "Reduce runtime pressure before continuing state-changing guard commands.",
      cap_warnings: warnings,
      cap_blocks: blocks,
    };
  }

  if (warnings.length > 0) {
    return {
      status: "WARN",
      reason: `runtime caps nearing limit: ${warnings.join(", ")}.`,
      evidence_checked: ["runtime_context", "runtime_caps"],
      next_step: "Continue carefully and watch the current caps before pushing more work.",
      cap_warnings: warnings,
      cap_blocks: [],
    };
  }

  return {
    status: "PASS",
    reason: "runtime caps are within safe range.",
    evidence_checked: ["runtime_context", "runtime_caps"],
    next_step: "Continue with the current workflow.",
    cap_warnings: [],
    cap_blocks: [],
  };
}

export function applyRuntimeCaps(result: GuardResult, capReport: RuntimeCapReport): GuardResult {
  const nextStatus = maxSeverity(result.status, capReport.status);
  return {
    ...result,
    status: nextStatus,
    reason: nextStatus === "PASS" ? result.reason : `${result.reason} ${capReport.reason}`,
    runtime_caps: capReport,
  };
}

export function shouldEnforceRuntimeCaps(command: string, subcommand?: string): boolean {
  if (
    command === "stage" ||
    command === "check" ||
    command === "verify-claim" ||
    command === "set-mode" ||
    command === "decide-mode" ||
    command === "record" ||
    command === "task"
  ) {
    return true;
  }

  return command === "session" && subcommand === "attach-root";
}
