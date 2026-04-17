import { z } from "zod";

export const sessionContextSchema = z.object({
  session_id: z.string().min(1),
  created_at: z.string().min(1),
  primary_root: z.string().min(1),
  attached_roots: z.array(z.string().min(1)).default([]),
  objective: z.string().default(""),
  scope: z.string().default(""),
  non_scope: z.string().default(""),
  active_spec_artifacts: z.array(z.string()).default([]),
  validation_targets: z.array(z.string()).default([]),
});

export type SessionContext = z.infer<typeof sessionContextSchema>;

export function createSessionContext(primaryRoot: string): SessionContext {
  return {
    session_id: `session-${Date.now()}`,
    created_at: new Date().toISOString(),
    primary_root: primaryRoot,
    attached_roots: [primaryRoot],
    objective: "",
    scope: "",
    non_scope: "",
    active_spec_artifacts: [],
    validation_targets: [],
  };
}

export function parseSessionContext(input: unknown): SessionContext {
  const parsed = sessionContextSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`Invalid session context: ${parsed.error.issues.map((issue) => issue.message).join(", ")}`);
  }

  return parsed.data;
}
