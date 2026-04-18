import { z } from "zod";

import { executionModeSchema } from "./config.js";

export const reviewStatusSchema = z.enum(["unknown", "pass", "warn", "block"]);
export const verificationEvidenceSchema = z.object({
  command: z.string().min(1),
  exit_code: z.number().int(),
  summary: z.string().min(1),
  evidence_ref: z.string().min(1).optional(),
});

export const harnessStateSchema = z.object({
  current_stage: z.enum([
    "plan",
    "openspec",
    "review1",
    "implementation",
    "review2",
    "local_run",
    "review3",
    "hardening",
  ]),
  approved_plan: z.boolean(),
  openspec_ready: z.boolean(),
  review1_passed: z.boolean(),
  review2_last_status: reviewStatusSchema,
  local_run_confirmed: z.boolean(),
  review3_passed: z.boolean(),
  execution_mode: executionModeSchema,
  adc_required: z.boolean(),
  adc_completed: z.boolean(),
  last_verification_claim: z.string().nullable().default(null),
  last_verification_evidence: z.array(verificationEvidenceSchema).default([]),
  active_operator: z.enum(["ide", "codex"]).default("ide"),
  operator_lock_reason: z.string().nullable().default(null),
});

export type ReviewStatus = z.infer<typeof reviewStatusSchema>;
export type VerificationEvidence = z.infer<typeof verificationEvidenceSchema>;
export type HarnessState = z.infer<typeof harnessStateSchema>;

export function createInitialState(): HarnessState {
  return {
    current_stage: "plan",
    approved_plan: false,
    openspec_ready: false,
    review1_passed: false,
    review2_last_status: "unknown",
    local_run_confirmed: false,
    review3_passed: false,
    execution_mode: "single-agent",
    adc_required: false,
    adc_completed: false,
    last_verification_claim: null,
    last_verification_evidence: [],
    active_operator: "ide",
    operator_lock_reason: null,
  };
}

export function parseHarnessState(input: unknown): HarnessState {
  const parsed = harnessStateSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`Invalid harness state: ${parsed.error.issues.map((issue) => issue.message).join(", ")}`);
  }

  return parsed.data;
}
