export type GuardStatus = "PASS" | "WARN" | "BLOCK";
export type ReviewStatus = "unknown" | "pass" | "warn" | "block";
export type GuardStage = "plan" | "openspec" | "review1" | "implementation" | "review2" | "local_run" | "review3" | "hardening";
export type ExecutionMode = "single-agent" | "role-based single-agent" | "multi-agent";

export interface VerificationEvidence {
  command: string;
  exit_code: number;
  summary: string;
}

export interface HarnessState {
  current_stage: GuardStage;
  approved_plan: boolean;
  openspec_ready: boolean;
  review1_passed: boolean;
  review2_last_status: ReviewStatus;
  local_run_confirmed: boolean;
  review3_passed: boolean;
  execution_mode: ExecutionMode;
  adc_required: boolean;
  adc_completed: boolean;
  last_verification_claim: string | null;
  last_verification_evidence: VerificationEvidence[];
  active_operator: "ide" | "codex";
  operator_lock_reason: string | null;
}

export interface GuardResult {
  status: GuardStatus;
  reason: string;
  evidence_checked: string[];
  next_step: string;
  stage?: string;
  [key: string]: unknown;
}

export interface OrchestratorResult {
  status: GuardStatus;
  reason: string;
  next_step: string;
  execution_mode?: string;
  parallelizable?: string[];
  non_parallelizable?: string[];
  lead?: string[];
  workers?: string[];
  fallback?: string;
  caps?: string[];
  stop_conditions?: string[];
}

export interface OpenSpecDecision {
  artifact_level: "minimal" | "standard" | "full";
  external_skill_recommended: boolean;
  external_skill_reason: string | null;
  required_artifacts: string[];
  readiness_missing: string[];
  review_gate_ready: boolean;
}

export interface SessionContext {
  session_id: string;
  created_at: string;
  primary_root: string;
  attached_roots: string[];
  objective: string;
  scope: string;
  non_scope: string;
  active_spec_artifacts: string[];
  validation_targets: string[];
}

export interface SessionSnapshot {
  primary_root: string;
  attached_reference_roots: string[];
  current_stage: string;
  relevant_paths: string[];
  active_spec_artifacts: string[];
}
