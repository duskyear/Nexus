import { z } from "zod";

export const runtimeContextSchema = z.object({
  resolved_instruction_files: z.array(z.string()).default([]),
  relevant_paths: z.array(z.string()).default([]),
  known_risks: z.array(z.string()).default([]),
  open_questions: z.array(z.string()).default([]),
  next_recommended_action: z.string().nullable().default(null),
  last_handoff: z.string().nullable().default(null),
  tool_calls_used: z.number().int().nonnegative().default(0),
  review_count: z.number().int().nonnegative().default(0),
  verification_count: z.number().int().nonnegative().default(0),
  fallback_count: z.number().int().nonnegative().default(0),
  retries_used: z.number().int().nonnegative().default(0),
  stage_entered_at: z.string().datetime().nullable().default(null),
  session_started_at: z.string().datetime().nullable().default(null),
  elapsed_ms: z.number().int().nonnegative().default(0),
  cap_warnings: z.number().int().nonnegative().default(0),
  cap_blocks: z.number().int().nonnegative().default(0),
});

export type RuntimeContext = z.infer<typeof runtimeContextSchema>;

export function createRuntimeContext(): RuntimeContext {
  return {
    resolved_instruction_files: [],
    relevant_paths: [],
    known_risks: [],
    open_questions: [],
    next_recommended_action: null,
    last_handoff: null,
    tool_calls_used: 0,
    review_count: 0,
    verification_count: 0,
    fallback_count: 0,
    retries_used: 0,
    stage_entered_at: null,
    session_started_at: null,
    elapsed_ms: 0,
    cap_warnings: 0,
    cap_blocks: 0,
  };
}

export function parseRuntimeContext(input: unknown): RuntimeContext {
  const parsed = runtimeContextSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`Invalid runtime context: ${parsed.error.issues.map((issue) => issue.message).join(", ")}`);
  }

  return parsed.data;
}
