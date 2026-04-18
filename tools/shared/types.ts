export type GuardStatus = "PASS" | "WARN" | "BLOCK";
export type WorkMode = "analysis" | "implementation" | "validation" | "delivery";

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
