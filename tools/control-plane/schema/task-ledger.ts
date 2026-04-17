import { z } from "zod";

export const taskStatusSchema = z.enum(["open", "blocked", "done"]);

export const taskEntrySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: taskStatusSchema,
  owner_mode: z.string().default("single-agent"),
  evidence_refs: z.array(z.string().min(1)).default([]),
  notes: z.array(z.string().min(1)).default([]),
  blocked_reason: z.string().nullable().default(null),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});

export const taskLedgerSchema = z.object({
  tasks: z.array(taskEntrySchema).default([]),
});

export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type TaskEntry = z.infer<typeof taskEntrySchema>;
export type TaskLedger = z.infer<typeof taskLedgerSchema>;

export function createTaskLedger(): TaskLedger {
  return {
    tasks: [],
  };
}

export function parseTaskLedger(input: unknown): TaskLedger {
  const parsed = taskLedgerSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`Invalid task ledger: ${parsed.error.issues.map((issue) => issue.message).join(", ")}`);
  }

  return parsed.data;
}
