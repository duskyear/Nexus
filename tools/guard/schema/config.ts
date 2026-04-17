import { z } from "zod";

export const executionModeSchema = z.enum([
  "single-agent",
  "role-based single-agent",
  "multi-agent",
]);

export const permissionProfileSchema = z.enum([
  "read-only",
  "workspace-write",
  "danger-full-access",
]);

const stageSchema = z.enum([
  "plan",
  "openspec",
  "review1",
  "implementation",
  "review2",
  "local_run",
  "review3",
  "hardening",
]);

export type GuardStage = z.infer<typeof stageSchema>;
export type ExecutionMode = z.infer<typeof executionModeSchema>;
export type PermissionProfile = z.infer<typeof permissionProfileSchema>;

const runtimeCapSchema = z.object({
  warn: z.number().int().nonnegative(),
  block: z.number().int().nonnegative(),
}).refine((value) => value.block > value.warn, {
  message: "runtime cap block threshold must be greater than warn threshold",
});

export const defaultRuntimeCaps = {
  tool_calls_used: { warn: 8, block: 10 },
  review_count: { warn: 2, block: 3 },
  verification_count: { warn: 3, block: 5 },
  fallback_count: { warn: 1, block: 2 },
  retries_used: { warn: 3, block: 5 },
  elapsed_ms: { warn: 2 * 60 * 60 * 1000, block: 4 * 60 * 60 * 1000 },
} as const;

export const runtimeCapsSchema = z.object({
  tool_calls_used: runtimeCapSchema,
  review_count: runtimeCapSchema,
  verification_count: runtimeCapSchema,
  fallback_count: runtimeCapSchema,
  retries_used: runtimeCapSchema,
  elapsed_ms: runtimeCapSchema,
}).default(defaultRuntimeCaps);

export type RuntimeCapsConfig = z.infer<typeof runtimeCapsSchema>;

export const defaultPermissionProfilesByStage = {
  plan: "read-only",
  openspec: "read-only",
  review1: "read-only",
  implementation: "workspace-write",
  review2: "read-only",
  local_run: "workspace-write",
  review3: "read-only",
  hardening: "workspace-write",
} as const;

const defaultPermissionProfiles = {
  default_by_stage: {
    ...defaultPermissionProfilesByStage,
  },
  allow_dependency_changes: false,
  allow_unrelated_refactor: false,
} as const;

export const permissionProfilesSchema = z.object({
  default_by_stage: z.record(stageSchema, permissionProfileSchema),
  allow_dependency_changes: z.boolean(),
  allow_unrelated_refactor: z.boolean(),
}).default(defaultPermissionProfiles);

export const guardConfigSchema = z.object({
  version: z.literal(1),
  stages: z.array(stageSchema).min(1),
  allowed_transitions: z.record(stageSchema, z.array(stageSchema)),
  required_plan_fields: z.array(z.string()).min(1),
  execution_mode_rules: z.object({
    default: executionModeSchema,
    medium_complexity: executionModeSchema,
    multi_agent_requires: z.array(z.string()).min(1),
  }),
  skill_triggers: z.record(z.string(), z.string()).refine(
    (value) => Object.keys(value).length > 0,
    "skill_triggers must contain at least one mapping",
  ),
  skill_recommendations: z
    .record(
      z.enum([
        "plan",
        "openspec",
        "review1",
        "implementation",
        "review2",
        "local_run",
        "review3",
        "hardening",
      ]),
      z.array(z.string().min(1)).min(1),
    )
    .default({}),
  allowed_skills: z
    .record(stageSchema, z.array(z.string()).min(1))
    .default({
      plan: ["file_read", "search", "web_search", "browser"],
      openspec: ["file_read", "search", "file_edit", "web_search"],
      review1: ["file_read", "search"],
      implementation: ["*"],
      review2: ["file_read", "search"],
      local_run: ["run_command", "file_read"],
      review3: ["file_read", "search"],
      hardening: ["*"],
    }),
  high_risk_changes: z.array(z.string()).min(1),
  review_gates: z.array(z.enum(["review1", "review2", "review3"])).min(1),
  claim_keywords: z.array(z.string()).min(1),
  permission_profiles: permissionProfilesSchema,
  runtime_caps: runtimeCapsSchema,
});

export type GuardConfig = z.infer<typeof guardConfigSchema>;

export function parseGuardConfig(input: unknown): GuardConfig {
  const parsed = guardConfigSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`Invalid guard config: ${parsed.error.issues.map((issue) => issue.message).join(", ")}`);
  }

  return parsed.data;
}

export function resolvePermissionProfileForStage(
  config: GuardConfig,
  stage: GuardStage,
): PermissionProfile {
  return config.permission_profiles?.default_by_stage?.[stage] ?? defaultPermissionProfilesByStage[stage] ?? "read-only";
}

export function stageAllowsWorkspaceWrite(
  config: GuardConfig,
  stage: GuardStage,
): boolean {
  return resolvePermissionProfileForStage(config, stage) !== "read-only";
}
