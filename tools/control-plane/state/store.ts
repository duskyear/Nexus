import { access, mkdir, readFile, writeFile, open, unlink } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";

import type { HarnessState, VerificationEvidence } from "../../shared/types.js";
import {
  createEvidenceLog,
  createRuntimeContext,
  createSessionContext,
  createTaskLedger,
  createWorkflowState,
  parseEvidenceLog,
  parseRuntimeContext,
  parseSessionContext,
  parseTaskLedger,
  parseWorkflowState,
  type EvidenceLog,
  type RuntimeContext,
  type SessionContext,
  type TaskLedger,
  type WorkflowState,
} from "../schema/index.js";

const HARNESS_DIR = ".harness";
const LEGACY_STATE_PATH = ".harness-state.json";
const WORKFLOW_STATE_PATH = join(HARNESS_DIR, "workflow-state.json");
const SESSION_CONTEXT_PATH = join(HARNESS_DIR, "session-context.json");
const RUNTIME_CONTEXT_PATH = join(HARNESS_DIR, "runtime-context.json");
const EVIDENCE_LOG_PATH = join(HARNESS_DIR, "evidence-log.json");
const TASK_LEDGER_PATH = join(HARNESS_DIR, "task-ledger.json");
const LOCK_FILE_PATH = join(HARNESS_DIR, "store.lock");

async function acquireLock(cwd: string, retries = 7, baseDelay = 100): Promise<void> {
  const harnessDir = join(cwd, HARNESS_DIR);
  await mkdir(harnessDir, { recursive: true });
  const lockPath = join(cwd, LOCK_FILE_PATH);
  for (let i = 0; i < retries; i++) {
    try {
      const handle = await open(lockPath, "wx");
      await handle.close();
      return;
    } catch (e: any) {
      if (e.code === "EEXIST") {
        await new Promise((resolve) => setTimeout(resolve, baseDelay * Math.pow(1.5, i)));
      } else {
        throw e;
      }
    }
  }
  throw new Error(`Failed to acquire lock at ${lockPath} after ${retries} attempts.`);
}

async function releaseLock(cwd: string): Promise<void> {
  const lockPath = join(cwd, LOCK_FILE_PATH);
  try {
    await unlink(lockPath);
  } catch (e: any) {
    if (e.code !== "ENOENT") throw e;
  }
}


export interface ControlPlaneState {
  workflow: WorkflowState;
  session: SessionContext;
  runtime: RuntimeContext;
  evidence: EvidenceLog;
  tasks: TaskLedger;
}

function parseJsonFile(raw: string): unknown {
  return JSON.parse(raw.replace(/^\uFEFF/, ""));
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readJsonIfPresent(path: string): Promise<unknown | null> {
  if (!(await pathExists(path))) {
    return null;
  }

  return parseJsonFile(await readFile(path, "utf8"));
}

function ensureAttachedRoots(primaryRoot: string, attachedRoots: string[]): string[] {
  const unique = Array.from(new Set([primaryRoot, ...attachedRoots]));
  return unique;
}

function migrateLegacyState(cwd: string, legacy: HarnessState | null): ControlPlaneState {
  const workflow = createWorkflowState();
  const session = createSessionContext(cwd);
  const runtime = createRuntimeContext();
  const evidence = createEvidenceLog();
  const tasks = createTaskLedger();

  if (!legacy) {
    return { workflow, session, runtime, evidence, tasks };
  }

  workflow.current_stage = legacy.current_stage;
  workflow.approved_plan = legacy.approved_plan;
  workflow.openspec_ready = legacy.openspec_ready;
  workflow.review1_passed = legacy.review1_passed;
  workflow.review2_last_status = legacy.review2_last_status;
  workflow.local_run_confirmed = legacy.local_run_confirmed;
  workflow.review3_status = legacy.review3_passed ? "pass" : "block";
  workflow.delivery_status = legacy.review3_passed ? "deliverable" : "not_deliverable";
  workflow.execution_mode = legacy.execution_mode;
  workflow.adc_required = legacy.adc_required;
  workflow.adc_completed = legacy.adc_completed;
  workflow.active_operator = legacy.active_operator;
  workflow.operator_lock_reason = legacy.operator_lock_reason;

  evidence.verification_entries = (legacy.last_verification_evidence ?? []).map((item) => ({
    claim: legacy.last_verification_claim ?? "unspecified",
    command: item.command,
    exit_code: item.exit_code,
    summary: item.summary,
    recorded_at: new Date(0).toISOString(),
  }));

  return { workflow, session, runtime, evidence, tasks };
}

export function createControlPlaneState(primaryRoot: string): ControlPlaneState {
  return migrateLegacyState(primaryRoot, null);
}

export async function loadControlPlaneState(cwd: string): Promise<ControlPlaneState> {
  await acquireLock(cwd);
  try {
    const workflowRaw = await readJsonIfPresent(join(cwd, WORKFLOW_STATE_PATH));
    const sessionRaw = await readJsonIfPresent(join(cwd, SESSION_CONTEXT_PATH));
    const runtimeRaw = await readJsonIfPresent(join(cwd, RUNTIME_CONTEXT_PATH));
    const evidenceRaw = await readJsonIfPresent(join(cwd, EVIDENCE_LOG_PATH));
    const tasksRaw = await readJsonIfPresent(join(cwd, TASK_LEDGER_PATH));

    if (workflowRaw || sessionRaw || runtimeRaw || evidenceRaw || tasksRaw) {
      const workflow = workflowRaw ? parseWorkflowState(workflowRaw) : createWorkflowState();
      const session = sessionRaw ? parseSessionContext(sessionRaw) : createSessionContext(cwd);
      const runtime = runtimeRaw ? parseRuntimeContext(runtimeRaw) : createRuntimeContext();
      const evidence = evidenceRaw ? parseEvidenceLog(evidenceRaw) : createEvidenceLog();
      const tasks = tasksRaw ? parseTaskLedger(tasksRaw) : createTaskLedger();

      session.attached_roots = ensureAttachedRoots(session.primary_root, session.attached_roots);
      return { workflow, session, runtime, evidence, tasks };
    }

    const legacyRaw = await readJsonIfPresent(join(cwd, LEGACY_STATE_PATH));
    return migrateLegacyState(cwd, (legacyRaw as HarnessState | null) ?? null);
  } finally {
    await releaseLock(cwd);
  }
}

export async function saveControlPlaneState(cwd: string, state: ControlPlaneState): Promise<void> {
  await acquireLock(cwd);
  try {
    state.session.attached_roots = ensureAttachedRoots(state.session.primary_root, state.session.attached_roots);
    await writeFile(join(cwd, WORKFLOW_STATE_PATH), `${JSON.stringify(state.workflow, null, 2)}\n`, "utf8");
    await writeFile(join(cwd, SESSION_CONTEXT_PATH), `${JSON.stringify(state.session, null, 2)}\n`, "utf8");
    await writeFile(join(cwd, RUNTIME_CONTEXT_PATH), `${JSON.stringify(state.runtime, null, 2)}\n`, "utf8");
    await writeFile(join(cwd, EVIDENCE_LOG_PATH), `${JSON.stringify(state.evidence, null, 2)}\n`, "utf8");
    await writeFile(join(cwd, TASK_LEDGER_PATH), `${JSON.stringify(state.tasks, null, 2)}\n`, "utf8");
  } finally {
    await releaseLock(cwd);
  }
}

export function toLegacyHarnessState(state: ControlPlaneState): HarnessState {
  const latestClaim = state.evidence.verification_entries.length > 0 
    ? state.evidence.verification_entries[state.evidence.verification_entries.length - 1].claim 
    : null;
  const latestEvidence = latestClaim
    ? state.evidence.verification_entries
        .filter((entry) => entry.claim === latestClaim)
        .map<VerificationEvidence>(({ command, exit_code, summary }) => ({
          command,
          exit_code,
          summary,
        }))
    : [];

  return {
    current_stage: state.workflow.current_stage,
    approved_plan: state.workflow.approved_plan,
    openspec_ready: state.workflow.openspec_ready,
    review1_passed: state.workflow.review1_passed,
    review2_last_status: state.workflow.review2_last_status,
    local_run_confirmed: state.workflow.local_run_confirmed,
    review3_passed: state.workflow.review3_status === "pass",
    execution_mode: state.workflow.execution_mode,
    adc_required: state.workflow.adc_required,
    adc_completed: state.workflow.adc_completed,
    last_verification_claim: latestClaim,
    last_verification_evidence: latestEvidence,
    active_operator: state.workflow.active_operator,
    operator_lock_reason: state.workflow.operator_lock_reason,
  };
}

export function applyLegacyHarnessState(
  current: ControlPlaneState,
  legacy: HarnessState,
): ControlPlaneState {
  const next = structuredClone(current) as ControlPlaneState;
  next.workflow.current_stage = legacy.current_stage;
  next.workflow.approved_plan = legacy.approved_plan;
  next.workflow.openspec_ready = legacy.openspec_ready;
  next.workflow.review1_passed = legacy.review1_passed;
  next.workflow.review2_last_status = legacy.review2_last_status;
  next.workflow.local_run_confirmed = legacy.local_run_confirmed;
  if (legacy.review3_passed) {
    next.workflow.review3_status = "pass";
    next.workflow.delivery_status = "deliverable";
  } else if (current.workflow.review3_status === "pass") {
    next.workflow.review3_status = "unknown";
    next.workflow.delivery_status = "unknown";
  }
  next.workflow.execution_mode = legacy.execution_mode;
  next.workflow.adc_required = legacy.adc_required;
  next.workflow.adc_completed = legacy.adc_completed;
  next.workflow.active_operator = legacy.active_operator;
  next.workflow.operator_lock_reason = legacy.operator_lock_reason;

  if (legacy.last_verification_claim) {
    next.evidence.verification_entries = legacy.last_verification_evidence.map((item) => ({
      claim: legacy.last_verification_claim ?? "unspecified",
      command: item.command,
      exit_code: item.exit_code,
      summary: item.summary,
      recorded_at: new Date().toISOString(),
    }));
  }

  return next;
}
