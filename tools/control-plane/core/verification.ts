import type { GuardConfig } from "../../guard/schema/config.js";
import type { HarnessState, VerificationEvidence } from "../../guard/schema/state.js";
import type { GuardResult } from "../../shared/types.js";

function createResult(result: GuardResult): GuardResult {
  return result;
}

export function withVerificationRecorded(
  state: HarnessState,
  options: { claim?: string; evidenceItems?: VerificationEvidence[] },
): HarnessState {
  const nextState = structuredClone(state);
  nextState.last_verification_claim = options.claim ?? null;
  nextState.last_verification_evidence = options.evidenceItems ?? [];
  return nextState;
}

export function evaluateClaim(
  config: GuardConfig,
  options: { claim?: string; evidenceCount?: number; evidenceItems?: VerificationEvidence[]; evidenceAligned?: boolean },
): GuardResult {
  const claim = options.claim?.toLowerCase();
  const evidenceItems = options.evidenceItems ?? [];

  if (!claim) {
    return createResult({
      status: "BLOCK",
      reason: "claim text is required for verify-claim.",
      evidence_checked: ["claim"],
      next_step: "Provide the exact completion claim being evaluated.",
    });
  }

  if (!config.claim_keywords.includes(claim)) {
    return createResult({
      status: "WARN",
      reason: `claim '${claim}' is not in configured completion claim keywords.`,
      evidence_checked: ["claim keywords"],
      next_step: "Use a configured claim keyword or update the rule set.",
    });
  }

  if (options.evidenceCount && evidenceItems.length === 0) {
    return createResult({
      status: "BLOCK",
      reason: "structured verification evidence is required; evidence counts alone are not accepted.",
      evidence_checked: ["claim", "evidence_count"],
      next_step: "Supply at least one evidence command, exit code, and summary tuple.",
    });
  }

  if (options.evidenceAligned === false) {
    return createResult({
      status: "BLOCK",
      reason: "structured evidence fields must be aligned; each evidence entry needs command, exit code, and summary.",
      evidence_checked: ["evidence_command", "evidence_exit_code", "evidence_summary"],
      next_step: "Re-run verify-claim with matching evidence tuples.",
    });
  }

  if (evidenceItems.length < 1) {
    return createResult({
      status: "BLOCK",
      reason: "structured verification evidence is required before a completion claim can be supported.",
      evidence_checked: ["claim", "structured_evidence"],
      next_step: "Run fresh validation and supply at least one complete evidence tuple.",
    });
  }

  return createResult({
    status: "PASS",
    reason: "completion claim has supporting evidence.",
    evidence_checked: ["claim", "structured_evidence"],
    next_step: "Review the evidence contents before delivery.",
  });
}
