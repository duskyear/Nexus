import { constants } from "node:fs";
import { access, realpath, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { ExecutionMode } from "../../guard/schema/config.js";
import { loadConfig, loadOrCreateState, loadState, saveState } from "../../guard/state/store.js";
import type { OrchestratorResult } from "../../orchestrator/core/types.js";
import type { GuardResult } from "../../shared/types.js";
import {
  fallbackExecutionMode,
  runOrchestrationPlan,
  splitSubtasks,
  validateOrchestration,
} from "../core/advisory.js";
import type { ControlPlaneState } from "../state/store.js";
import { assessOpenSpec } from "../core/openspec.js";
import { readEventLog } from "../core/event-log.js";
import { resolvePermissionProfileForStage } from "../../guard/schema/config.js";
import {
  attachRoot,
  createContextExport,
  createSessionCompactSurface,
  createContextSurface,
  deriveWorkMode,
  createRuntimeSummary,
  createSessionSurface,
  createSnapshot,
  startSession,
} from "../core/session.js";
import {
  enrichCheckTemplate,
  enrichStageTemplate,
  enrichVerifyClaimTemplate,
  getAdcTemplate,
  getCheckTemplate,
  getExecutionModeTemplate,
  getHighRiskConfirmationTemplate,
  getStageTemplate,
  getVerifyClaimTemplate,
  withSkillRecommendations,
} from "../../templates/core/templates.js";
import type { TemplateResult } from "../../templates/core/types.js";
import type { TaskEntry } from "../schema/index.js";

export interface ControlPlaneCommandContext {
  cwd: string;
  state: ControlPlaneState;
}

type ControlPlaneHandler = (argv: string[], context: ControlPlaneCommandContext) => Promise<{
  result: GuardResult;
  nextState?: ControlPlaneState;
}> | {
  result: GuardResult;
  nextState?: ControlPlaneState;
};

interface CommandSpec {
  key: string;
  handler: ControlPlaneHandler;
}

function readStringFlags(args: string[], flag: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === flag) {
      const next = args[index + 1];
      if (next && !next.startsWith("--")) {
        values.push(next);
      }
    }
  }

  return values;
}

function createTaskEntry(
  task: Pick<TaskEntry, "id" | "title"> & Partial<Omit<TaskEntry, "id" | "title" | "created_at" | "updated_at">>,
): TaskEntry {
  const timestamp = new Date().toISOString();
  return {
    id: task.id,
    title: task.title,
    status: task.status ?? "open",
    owner_mode: task.owner_mode ?? "single-agent",
    evidence_refs: task.evidence_refs ?? [],
    notes: task.notes ?? [],
    blocked_reason: task.blocked_reason ?? null,
    created_at: task.created_at ?? timestamp,
    updated_at: task.updated_at ?? timestamp,
  };
}

function findTaskIndex(state: ControlPlaneState, id: string): number {
  return state.tasks.tasks.findIndex((task) => task.id === id);
}

function upsertTask(state: ControlPlaneState, nextTask: TaskEntry): ControlPlaneState {
  const next = structuredClone(state) as ControlPlaneState;
  const index = findTaskIndex(next, nextTask.id);
  if (index === -1) {
    next.tasks.tasks.push(nextTask);
  } else {
    next.tasks.tasks[index] = nextTask;
  }
  return next;
}

function readFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  return args[index + 1];
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

async function validatePath(cwd: string, inputPath: string): Promise<{ valid: boolean; reason?: string }> {
  const workspaceRoot = resolve(cwd);
  const candidate = resolve(workspaceRoot, inputPath);
  const candidateRelative = relative(workspaceRoot, candidate);
  if (candidateRelative.startsWith("..") || isAbsolute(candidateRelative)) {
    return { valid: false, reason: "path must stay within the current workspace." };
  }

  try {
    const stats = await stat(candidate);
    if (!stats.isDirectory()) {
      return { valid: false, reason: "path must be a directory." };
    }

    const canonicalWorkspace = await realpath(workspaceRoot);
    const canonicalCandidate = await realpath(candidate);
    const canonicalRelative = relative(canonicalWorkspace, canonicalCandidate);
    if (canonicalRelative.startsWith("..") || isAbsolute(canonicalRelative)) {
      return { valid: false, reason: "path must stay within the current workspace." };
    }
  } catch {
    return { valid: false, reason: "path does not exist." };
  }

  return { valid: true };
}

const commandSpecs: CommandSpec[] = [
  {
    key: "session:start",
    handler: async (_argv, context) => {
      const config = await loadConfig(context.cwd);
      const nextState = startSession(context.state, context.cwd);
      return {
        result: {
          status: "PASS",
        reason: "session started.",
        evidence_checked: ["cwd", "session_context"],
        next_step: "Attach reference roots or continue into planning.",
        stage: nextState.workflow.current_stage,
        session_context: nextState.session,
        session_surface: createSessionSurface(nextState, {
          permissionProfile: resolvePermissionProfileForStage(config, nextState.workflow.current_stage),
        }),
        runtime_summary: createRuntimeSummary(nextState),
      },
      nextState,
    };
  },
  },
  {
    key: "session:resume",
    handler: async (_argv, context) => {
      const config = await loadConfig(context.cwd);
      return {
        result: {
          status: "PASS",
          reason: "session context loaded.",
          evidence_checked: ["session_context"],
          next_step: "Use session.status or context.snapshot to inspect the active control plane context.",
          stage: context.state.workflow.current_stage,
          session_context: context.state.session,
          session_surface: createSessionSurface(context.state, {
            permissionProfile: resolvePermissionProfileForStage(config, context.state.workflow.current_stage),
          }),
          runtime_summary: createRuntimeSummary(context.state),
        },
      };
    },
  },
  {
    key: "session:status",
    handler: async (_argv, context) => {
      const config = await loadConfig(context.cwd);
      const compact = hasFlag(_argv, "--compact");
      const sessionSurfaceOptions = {
        permissionProfile: resolvePermissionProfileForStage(config, context.state.workflow.current_stage),
      };
      return {
        result: {
          status: "PASS",
          reason: "session status available.",
          evidence_checked: ["session_context", "workflow_state"],
          next_step: "Use context.snapshot for a compact Codex handoff package.",
          stage: context.state.workflow.current_stage,
          session_context: context.state.session,
          session_surface: createSessionSurface(context.state, sessionSurfaceOptions),
          ...(compact
            ? {
                session_compact: createSessionCompactSurface(context.state, sessionSurfaceOptions),
              }
            : {}),
          runtime_summary: createRuntimeSummary(context.state),
        },
      };
    },
  },
  {
    key: "session:attach-root",
    handler: async (argv, context) => {
      const path = readFlag(argv, "--path");
      const role = (readFlag(argv, "--role") ?? "reference") as "primary" | "reference";
      if (!path) {
        return {
          result: {
            status: "BLOCK",
            reason: "attach-root requires --path.",
            evidence_checked: ["path"],
            next_step: "Re-run session attach-root with --path <directory>.",
            stage: context.state.workflow.current_stage,
          },
        };
      }

      const pathValidation = await validatePath(context.cwd, path);
      if (!pathValidation.valid) {
        return {
          result: {
            status: "BLOCK",
            reason: `attach-root path validation failed: ${pathValidation.reason}`,
            evidence_checked: ["path", "path_validation"],
            next_step: "Provide a valid directory path within the current working directory.",
            stage: context.state.workflow.current_stage,
          },
        };
      }

      const nextState = attachRoot(context.state, { path, role });
      return {
        result: {
          status: "PASS",
        reason: `attached ${role} root.`,
        evidence_checked: ["path", "role", "session_context", "path_validation"],
        next_step: "Use context.snapshot to confirm the active multi-root context.",
        stage: nextState.workflow.current_stage,
        session_context: nextState.session,
        session_surface: createSessionSurface(nextState, {
          permissionProfile: resolvePermissionProfileForStage(
            await loadConfig(context.cwd),
            nextState.workflow.current_stage,
          ),
        }),
        runtime_summary: createRuntimeSummary(nextState),
      },
        nextState,
      };
    },
  },
  {
    key: "context:snapshot",
    handler: async (_argv, context) => {
      const config = await loadConfig(context.cwd);
      return {
        result: {
          status: "PASS",
          reason: "context snapshot generated.",
          evidence_checked: ["session_context", "runtime_context"],
          next_step: "Use this snapshot as the Codex handoff or execution context summary.",
          stage: context.state.workflow.current_stage,
          snapshot: createSnapshot(context.state),
          context_surface: createContextSurface(context.state, {
            permissionProfile: resolvePermissionProfileForStage(config, context.state.workflow.current_stage),
          }),
          runtime_summary: createRuntimeSummary(context.state),
        },
      };
    },
  },
  {
    key: "context:summary",
    handler: async (_argv, context) => {
      const config = await loadConfig(context.cwd);
      return {
        result: {
          status: "PASS",
          reason: "context summary generated.",
          evidence_checked: ["session_context", "runtime_context"],
          next_step: "Continue with the next stage using the summarized context.",
          stage: context.state.workflow.current_stage,
          snapshot: createSnapshot(context.state),
          context_surface: createContextSurface(context.state, {
            permissionProfile: resolvePermissionProfileForStage(config, context.state.workflow.current_stage),
          }),
          runtime_summary: createRuntimeSummary(context.state),
        },
      };
    },
  },
  {
    key: "context:export",
    handler: async (_argv, context) => {
      const config = await loadConfig(context.cwd);
      const permissionProfile = resolvePermissionProfileForStage(config, context.state.workflow.current_stage);
      const outputPath = readFlag(_argv, "--output");
      const exportPackage = createContextExport(context.state, { permissionProfile });
      const result: GuardResult = {
        status: "PASS",
        reason: "context export generated.",
        evidence_checked: ["session_context", "runtime_context", "task_ledger", "evidence_log"],
        next_step: "Use the export package to hand off context or begin the next stage.",
        stage: context.state.workflow.current_stage,
        context_export: exportPackage,
        runtime_summary: createRuntimeSummary(context.state),
      };

      if (outputPath) {
        const resolvedOutput = resolve(context.cwd, outputPath);
        await writeFile(resolvedOutput, `${JSON.stringify(exportPackage, null, 2)}\n`, "utf8");
        result.context_export_path = resolvedOutput;
      }

      return {
        result,
      };
    },
  },
  {
    key: "context:paths",
    handler: async (_argv, context) => {
      const config = await loadConfig(context.cwd);
      return {
        result: {
          status: "PASS",
          reason: "attached paths available.",
          evidence_checked: ["session_context"],
          next_step: "Attach more roots or continue with the active workspace set.",
          stage: context.state.workflow.current_stage,
          snapshot: createSnapshot(context.state),
          context_surface: createContextSurface(context.state, {
            permissionProfile: resolvePermissionProfileForStage(config, context.state.workflow.current_stage),
          }),
          runtime_summary: createRuntimeSummary(context.state),
        },
      };
    },
  },
  {
    key: "usage:summary",
    handler: async (_argv, context) => {
      const config = await loadConfig(context.cwd);
      const taskCounts = context.state.tasks.tasks.reduce(
        (counts, task) => {
          counts.total += 1;
          counts[task.status] += 1;
          return counts;
        },
        { total: 0, open: 0, blocked: 0, done: 0 },
      );

      return {
        result: {
          status: "PASS",
          reason: "usage summary available.",
          evidence_checked: ["session_context", "runtime_context", "task_ledger", "evidence_log"],
          next_step: "Use the usage summary to judge whether to continue, review, or wrap up.",
          stage: context.state.workflow.current_stage,
          usage_summary: {
            current_stage: context.state.workflow.current_stage,
            work_mode: deriveWorkMode(context.state.workflow.current_stage),
            execution_mode: context.state.workflow.execution_mode,
            permission_profile: resolvePermissionProfileForStage(config, context.state.workflow.current_stage),
            task_counts: taskCounts,
            evidence_counts: {
              verification_entries: context.state.evidence.verification_entries.length,
              review_entries: context.state.evidence.review_entries.length,
              mode_decisions: context.state.evidence.mode_decisions.length,
              openspec_decisions: context.state.evidence.openspec_decisions.length,
            },
            runtime_summary: createRuntimeSummary(context.state),
            next_recommended_action: context.state.runtime.next_recommended_action,
          },
          runtime_summary: createRuntimeSummary(context.state),
        },
      };
    },
  },
  {
    key: "event:summary",
    handler: async (_argv, context) => {
      const events = await readEventLog(context.cwd);
      const counts = events.reduce<Record<string, number>>((acc, event) => {
        acc[event.type] = (acc[event.type] ?? 0) + 1;
        return acc;
      }, {});
      const stageDistribution = events.reduce<Record<string, number>>((acc, event) => {
        if (event.type === "stage_entered") {
          acc[event.stage] = (acc[event.stage] ?? 0) + 1;
        }
        return acc;
      }, {});

      return {
        result: {
          status: "PASS",
          reason: "event log summary available.",
          evidence_checked: ["event_log"],
          next_step: "Use the latest event to understand the most recent workflow transition.",
          stage: context.state.workflow.current_stage,
          event_log_summary: {
            total_events: events.length,
            counts,
            stage_distribution: stageDistribution,
            recent_events: events.slice(-5),
            latest_event: events.at(-1) ?? null,
          },
        },
      };
    },
  },
  {
    key: "task:add",
    handler: (argv, context) => {
      const id = readFlag(argv, "--id");
      const title = readFlag(argv, "--title");
      if (!id || !title) {
        return {
          result: {
            status: "BLOCK",
            reason: "task add requires --id and --title.",
            evidence_checked: ["id", "title"],
            next_step: "Provide both a task id and a task title.",
            stage: context.state.workflow.current_stage,
          },
        };
      }

      const nextTask = createTaskEntry({ id, title });
      const nextState = upsertTask(context.state, nextTask);
      const compactedTasks = nextState.tasks.tasks.map(t => 
        t.status === "done" 
          ? { id: t.id, title: t.title, status: t.status, updated_at: t.updated_at } 
          : t
      );
      return {
        result: {
          status: "PASS",
          reason: `task ${id} added.`,
          evidence_checked: ["id", "title", "task_ledger"],
          next_step: "Use task list to inspect the ledger or task done to mark it complete.",
          stage: context.state.workflow.current_stage,
          task_ledger: {
            ...nextState.tasks,
            tasks: compactedTasks
          },
        },
        nextState,
      };
    },
  },
  {
    key: "task:list",
    handler: (_argv, context) => {
      const compactedTasks = context.state.tasks.tasks.map(t => 
        t.status === "done" 
          ? { id: t.id, title: t.title, status: t.status, updated_at: t.updated_at } 
          : t
      );
      
      return {
        result: {
          status: "PASS",
          reason: "task ledger available.",
          evidence_checked: ["task_ledger"],
          next_step: "Add, block, complete, or link evidence to tasks as needed.",
          stage: context.state.workflow.current_stage,
          task_ledger: {
            ...context.state.tasks,
            tasks: compactedTasks
          },
        },
      };
    },
  },
  {
    key: "task:done",
    handler: (argv, context) => {
      const id = readFlag(argv, "--id");
      if (!id) {
        return {
          result: {
            status: "BLOCK",
            reason: "task done requires --id.",
            evidence_checked: ["id"],
            next_step: "Provide the task id to mark complete.",
            stage: context.state.workflow.current_stage,
          },
        };
      }

      const index = findTaskIndex(context.state, id);
      if (index === -1) {
        return {
          result: {
            status: "BLOCK",
            reason: `task ${id} does not exist.`,
            evidence_checked: ["task_ledger"],
            next_step: "Add the task before trying to complete it.",
            stage: context.state.workflow.current_stage,
          },
        };
      }

      const evidenceRefs = readStringFlags(argv, "--evidence-ref");
      const next = structuredClone(context.state) as ControlPlaneState;
      next.tasks.tasks[index] = {
        ...next.tasks.tasks[index],
        status: "done",
        evidence_refs: Array.from(new Set([...next.tasks.tasks[index].evidence_refs, ...evidenceRefs])),
        updated_at: new Date().toISOString(),
      };
      const compactedTasks = next.tasks.tasks.map(t => 
        t.status === "done" 
          ? { id: t.id, title: t.title, status: t.status, updated_at: t.updated_at } 
          : t
      );

      return {
        result: {
          status: "PASS",
          reason: `task ${id} marked done.`,
          evidence_checked: ["task_ledger", "evidence_ref"],
          next_step: "Use task list to review the updated ledger.",
          stage: context.state.workflow.current_stage,
          task_ledger: {
            ...next.tasks,
            tasks: compactedTasks
          },
        },
        nextState: next,
      };
    },
  },
  {
    key: "task:block",
    handler: (argv, context) => {
      const id = readFlag(argv, "--id");
      const reason = readFlag(argv, "--reason");
      if (!id || !reason) {
        return {
          result: {
            status: "BLOCK",
            reason: "task block requires --id and --reason.",
            evidence_checked: ["id", "reason"],
            next_step: "Provide both the task id and the block reason.",
            stage: context.state.workflow.current_stage,
          },
        };
      }

      const index = findTaskIndex(context.state, id);
      if (index === -1) {
        return {
          result: {
            status: "BLOCK",
            reason: `task ${id} does not exist.`,
            evidence_checked: ["task_ledger"],
            next_step: "Add the task before trying to block it.",
            stage: context.state.workflow.current_stage,
          },
        };
      }

      const next = structuredClone(context.state) as ControlPlaneState;
      next.tasks.tasks[index] = {
        ...next.tasks.tasks[index],
        status: "blocked",
        blocked_reason: reason,
        updated_at: new Date().toISOString(),
      };
      const compactedTasks = next.tasks.tasks.map(t => 
        t.status === "done" 
          ? { id: t.id, title: t.title, status: t.status, updated_at: t.updated_at } 
          : t
      );
      return {
        result: {
          status: "PASS",
          reason: `task ${id} blocked.`,
          evidence_checked: ["task_ledger", "reason"],
          next_step: "Use task list to review the updated ledger.",
          stage: context.state.workflow.current_stage,
          task_ledger: {
            ...next.tasks,
            tasks: compactedTasks
          },
        },
        nextState: next,
      };
    },
  },
  {
    key: "task:link-evidence",
    handler: (argv, context) => {
      const id = readFlag(argv, "--id");
      const evidenceRef = readFlag(argv, "--evidence-ref");
      if (!id || !evidenceRef) {
        return {
          result: {
            status: "BLOCK",
            reason: "task link-evidence requires --id and --evidence-ref.",
            evidence_checked: ["id", "evidence_ref"],
            next_step: "Provide the task id and a reference to the evidence artifact.",
            stage: context.state.workflow.current_stage,
          },
        };
      }

      const index = findTaskIndex(context.state, id);
      if (index === -1) {
        return {
          result: {
            status: "BLOCK",
            reason: `task ${id} does not exist.`,
            evidence_checked: ["task_ledger"],
            next_step: "Add the task before linking evidence.",
            stage: context.state.workflow.current_stage,
          },
        };
      }

      const next = structuredClone(context.state) as ControlPlaneState;
      next.tasks.tasks[index] = {
        ...next.tasks.tasks[index],
        evidence_refs: Array.from(new Set([...next.tasks.tasks[index].evidence_refs, evidenceRef])),
        updated_at: new Date().toISOString(),
      };
      const compactedTasks = next.tasks.tasks.map(t => 
        t.status === "done" 
          ? { id: t.id, title: t.title, status: t.status, updated_at: t.updated_at } 
          : t
      );
      return {
        result: {
          status: "PASS",
          reason: `evidence linked to task ${id}.`,
          evidence_checked: ["task_ledger", "evidence_ref"],
          next_step: "Use task list to review the updated ledger.",
          stage: context.state.workflow.current_stage,
          task_ledger: {
            ...next.tasks,
            tasks: compactedTasks
          },
        },
        nextState: next,
      };
    },
  },
  {
    key: "openspec:assess",
    handler: (argv, context) => {
      const complexity = readFlag(argv, "--complexity") as "low" | "medium" | "high" | undefined;
      const fileCount = Number.parseInt(readFlag(argv, "--file-count") ?? "1", 10);
      const taskCount = Number.parseInt(readFlag(argv, "--task-count") ?? "1", 10);
      const behaviorChange = hasFlag(argv, "--behavior-change");
      const decision = assessOpenSpec({
        complexity,
        fileCount: Number.isNaN(fileCount) ? 1 : fileCount,
        taskCount: Number.isNaN(taskCount) ? 1 : taskCount,
        behaviorChange,
      });
      const nextState = structuredClone(context.state);
      nextState.evidence.openspec_decisions.push({
        ...decision,
        complexity: complexity ?? "low",
        file_count: Number.isNaN(fileCount) ? 1 : fileCount,
        task_count: Number.isNaN(taskCount) ? 1 : taskCount,
        behavior_change: behaviorChange,
        recorded_at: new Date().toISOString(),
      });

      return {
        result: {
          status: "PASS",
          reason: `openspec artifact level assessed as ${decision.artifact_level}.`,
          evidence_checked: ["complexity", "file_count", "task_count", "behavior_change"],
          next_step: decision.external_skill_recommended
            ? "A fuller artifact set is recommended; external OpenSpec skill is optional."
            : "A lightweight spec artifact is sufficient.",
          stage: context.state.workflow.current_stage,
          openspec_decision: decision,
        },
        nextState,
      };
    },
  },
];

export async function dispatchControlPlaneCommand(
  argv: string[],
  context: ControlPlaneCommandContext,
): Promise<{ result: GuardResult; nextState?: ControlPlaneState } | null> {
  const [command, subcommand] = argv;
  if (!command) {
    return null;
  }

  const key = `${command}:${subcommand ?? ""}`;
  const spec = commandSpecs.find((item) => item.key === key);
  if (!spec) {
    return null;
  }

  return spec.handler(argv, context);
}

function readFlags(args: string[], flag: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === flag) {
      const next = args[index + 1];
      if (next && !next.startsWith("--")) {
        values.push(next);
      }
    }
  }

  return values;
}

function parseExecutionMode(value: string | undefined): ExecutionMode {
  if (value === "single-agent" || value === "role-based single-agent" || value === "multi-agent") {
    return value;
  }

  throw new Error(
    `Unsupported execution mode '${value ?? ""}'. Expected one of: single-agent, role-based single-agent, multi-agent.`,
  );
}

async function dispatchTemplateCommand(argv: string[], cwd: string): Promise<TemplateResult | null> {
  const config = await loadConfig(cwd);
  const state = await loadState(cwd);
  const [command, subcommand] = argv;

  if (!command) {
    return null;
  }

  if (command === "stage") {
    if (subcommand !== "plan" && subcommand !== "openspec" && subcommand !== "implementation") {
      throw new Error(`Unsupported stage template '${subcommand ?? ""}'.`);
    }

    const complexity = readFlag(argv, "--complexity");
    const fileCount = Number.parseInt(readFlag(argv, "--file-count") ?? "1", 10);
    const taskCount = Number.parseInt(readFlag(argv, "--task-count") ?? "1", 10);
    const behaviorChange = hasFlag(argv, "--behavior-change");

    const template = enrichStageTemplate(
      {
        ...getStageTemplate(subcommand),
        meta: {
          complexity: complexity === "medium" || complexity === "high" ? complexity : "low",
          fileCount: Number.isNaN(fileCount) ? 1 : fileCount,
          taskCount: Number.isNaN(taskCount) ? 1 : taskCount,
          behaviorChange,
        },
      },
      state,
    );

    return withSkillRecommendations(template, config.skill_recommendations[subcommand]);
  }

  if (command === "check") {
    if (subcommand !== "review1" && subcommand !== "review2" && subcommand !== "review3") {
      throw new Error(`Unsupported check template '${subcommand ?? ""}'.`);
    }

    return withSkillRecommendations(
      enrichCheckTemplate(getCheckTemplate(subcommand), state),
      config.skill_recommendations[subcommand],
    );
  }

  if (command === "verify-claim") {
    return withSkillRecommendations(
      enrichVerifyClaimTemplate(getVerifyClaimTemplate(), state),
      config.skill_recommendations.local_run ?? ["verification-before-completion"],
    );
  }

  if (command === "adc") {
    return getAdcTemplate();
  }

  if (command === "high-risk-confirmation") {
    return getHighRiskConfirmationTemplate();
  }

  if (command === "execution-mode") {
    return getExecutionModeTemplate();
  }

  throw new Error(`Unsupported template command '${command}'.`);
}

async function hasAdcFile(cwd: string): Promise<boolean> {
  try {
    await access(join(cwd, "harness", "AGENT_DESIGN_CARD.md"), constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function writeOrchestratorLog(cwd: string, entry: Record<string, unknown>): Promise<void> {
  await writeFile(join(cwd, ".orchestrator-log.json"), `${JSON.stringify(entry, null, 2)}\n`, "utf8");
}

async function dispatchOrchestratorCommand(argv: string[], cwd: string): Promise<OrchestratorResult | null> {
  await loadConfig(cwd);
  const [command] = argv;

  if (!command) {
    return null;
  }

  if (command === "validate") {
    const state = await loadOrCreateState(cwd);
    if (!(await hasAdcFile(cwd))) {
      return {
        status: "BLOCK",
        reason: "ADC file is missing; multi-agent orchestration cannot be validated.",
        next_step: "Create or restore harness/AGENT_DESIGN_CARD.md before validating orchestration.",
      };
    }
    return validateOrchestration(state);
  }

  if (command === "split") {
    return splitSubtasks(readFlags(argv, "--parallelizable"), readFlags(argv, "--sequential"));
  }

  if (command === "fallback") {
    const state = await loadOrCreateState(cwd);
    const target = parseExecutionMode(readFlag(argv, "--to"));
    const { result, nextState } = fallbackExecutionMode(state, target);
    await saveState(cwd, nextState);
    await writeOrchestratorLog(cwd, {
      command: "fallback",
      execution_mode: result.execution_mode ?? null,
      next_step: result.next_step,
    });
    return result;
  }

  if (command === "run") {
    const state = await loadOrCreateState(cwd);
    if (!(await hasAdcFile(cwd))) {
      return {
        status: "BLOCK",
        reason: "ADC file is missing; multi-agent orchestration cannot run.",
        next_step: "Create or restore harness/AGENT_DESIGN_CARD.md before running orchestration.",
      };
    }

    const validation = validateOrchestration(state);
    if (validation.status !== "PASS") {
      return validation;
    }

    const result = runOrchestrationPlan(readFlags(argv, "--parallelizable"), readFlags(argv, "--sequential"));
    await writeOrchestratorLog(cwd, {
      command: "run",
      lead: result.lead ?? [],
      workers: result.workers ?? [],
      fallback: result.fallback ?? null,
      caps: result.caps ?? [],
      stop_conditions: result.stop_conditions ?? [],
    });
    return result;
  }

  throw new Error(`Unsupported orchestrator command '${command}'.`);
}

export async function dispatchAuxiliaryCommand(
  kind: "template" | "orchestrator",
  argv: string[],
  options: { cwd: string },
): Promise<TemplateResult | OrchestratorResult | null> {
  if (kind === "template") {
    return dispatchTemplateCommand(argv, options.cwd);
  }

  return dispatchOrchestratorCommand(argv, options.cwd);
}
