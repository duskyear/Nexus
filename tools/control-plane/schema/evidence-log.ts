import { z } from "zod";

export const verificationEntrySchema = z.object({
  claim: z.string().min(1),
  command: z.string().min(1),
  exit_code: z.number().int(),
  summary: z.string().min(1),
  recorded_at: z.string().min(1),
});

export const reviewEntrySchema = z.object({
  gate: z.enum(["review1", "review2", "review3"]),
  status: z.enum(["pass", "warn", "block", "unknown"]),
  scope_drift: z.boolean().optional(),
  design_drift: z.boolean().optional(),
  mode_downgrade_needed: z.boolean().optional(),
  leftover_risk: z.boolean().optional(),
  reason: z.string(),
  recorded_at: z.string().min(1),
});

export const modeDecisionSchema = z.object({
  mode: z.enum(["single-agent", "role-based single-agent", "multi-agent"]),
  complexity: z.enum(["low", "medium", "high"]),
  approved_plan: z.boolean(),
  independent_subtasks: z.boolean().optional(),
  reduced_context_pollution: z.boolean().optional(),
  status: z.enum(["PASS", "WARN", "BLOCK"]),
  reason: z.string(),
  recorded_at: z.string().min(1),
});

export const openspecDecisionSchema = z.object({
  artifact_level: z.enum(["minimal", "standard", "full"]),
  complexity: z.enum(["low", "medium", "high"]),
  file_count: z.number().int(),
  task_count: z.number().int(),
  behavior_change: z.boolean(),
  external_skill_recommended: z.boolean(),
  external_skill_reason: z.string().nullable(),
  required_artifacts: z.array(z.string()),
  readiness_missing: z.array(z.string()),
  review_gate_ready: z.boolean(),
  recorded_at: z.string().min(1),
});

export const evidenceLogSchema = z.object({
  verification_entries: z.array(verificationEntrySchema).default([]),
  review_entries: z.array(reviewEntrySchema).default([]),
  mode_decisions: z.array(modeDecisionSchema).default([]),
  openspec_decisions: z.array(openspecDecisionSchema).default([]),
});

export type VerificationEntry = z.infer<typeof verificationEntrySchema>;
export type ReviewEntry = z.infer<typeof reviewEntrySchema>;
export type ModeDecision = z.infer<typeof modeDecisionSchema>;
export type OpenSpecDecisionEntry = z.infer<typeof openspecDecisionSchema>;
export type EvidenceLog = z.infer<typeof evidenceLogSchema>;

export function createEvidenceLog(): EvidenceLog {
  return {
    verification_entries: [],
    review_entries: [],
    mode_decisions: [],
    openspec_decisions: [],
  };
}

export function parseEvidenceLog(input: unknown): EvidenceLog {
  const parsed = evidenceLogSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`Invalid evidence log: ${parsed.error.issues.map((issue) => issue.message).join(", ")}`);
  }

  return parsed.data;
}
