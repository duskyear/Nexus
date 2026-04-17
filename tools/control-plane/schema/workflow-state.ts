import { z } from "zod";

import { executionModeSchema } from "../../guard/schema/config.js";

export const reviewStatusSchema = z.enum(["unknown", "pass", "warn", "block"]);

export const deliveryStatusSchema = z.enum([
  "unknown",
  "deliverable",
  "conditionally_deliverable",
  "not_deliverable",
]);

export const workflowStateSchema = z.object({
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
  review3_status: reviewStatusSchema,
  delivery_status: deliveryStatusSchema,
  execution_mode: executionModeSchema,
  adc_required: z.boolean(),
  adc_completed: z.boolean(),
  active_operator: z.enum(["ide", "codex"]).default("ide"),
  operator_lock_reason: z.string().nullable().default(null),
});

export type WorkflowState = z.infer<typeof workflowStateSchema>;

export function createWorkflowState(): WorkflowState {
  return {
    current_stage: "plan",
    approved_plan: false,
    openspec_ready: false,
    review1_passed: false,
    review2_last_status: "unknown",
    local_run_confirmed: false,
    review3_status: "unknown",
    delivery_status: "unknown",
    execution_mode: "single-agent",
    adc_required: false,
    adc_completed: false,
    active_operator: "ide",
    operator_lock_reason: null,
  };
}

export function parseWorkflowState(input: unknown): WorkflowState {
  const parsed = workflowStateSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`Invalid workflow state: ${parsed.error.issues.map((issue) => issue.message).join(", ")}`);
  }

  return parsed.data;
}
