import type { ControlPlaneState } from "../state/store.js";
import type { SessionSnapshot, WorkMode } from "../../shared/types.js";

export function deriveWorkMode(currentStage: ControlPlaneState["workflow"]["current_stage"]): WorkMode {
  if (currentStage === "plan" || currentStage === "openspec" || currentStage === "review1") {
    return "analysis";
  }

  if (currentStage === "implementation" || currentStage === "review2") {
    return "implementation";
  }

  if (currentStage === "local_run") {
    return "validation";
  }

  return "delivery";
}

export function createRuntimeSummary(state: ControlPlaneState): Record<string, unknown> {
  return {
    tool_calls_used: state.runtime.tool_calls_used,
    review_count: state.runtime.review_count,
    verification_count: state.runtime.verification_count,
    fallback_count: state.runtime.fallback_count,
    retries_used: state.runtime.retries_used,
    stage_entered_at: state.runtime.stage_entered_at,
    session_started_at: state.runtime.session_started_at,
    elapsed_ms: state.runtime.elapsed_ms,
    cap_warnings: state.runtime.cap_warnings,
    cap_blocks: state.runtime.cap_blocks,
  };
}

export function createSessionSurface(
  state: ControlPlaneState,
  options?: { permissionProfile?: string },
): Record<string, unknown> {
  return {
    session_id: state.session.session_id,
    current_stage: state.workflow.current_stage,
    work_mode: deriveWorkMode(state.workflow.current_stage),
    execution_mode: state.workflow.execution_mode,
    permission_profile: options?.permissionProfile ?? null,
    primary_root: state.session.primary_root,
    attached_roots: [...state.session.attached_roots],
    objective: state.session.objective,
    scope: state.session.scope,
    non_scope: state.session.non_scope,
    active_spec_artifacts: [...state.session.active_spec_artifacts],
    validation_targets: [...state.session.validation_targets],
    known_risks: [...state.runtime.known_risks],
    open_questions: [...state.runtime.open_questions],
    next_recommended_action: state.runtime.next_recommended_action,
    last_handoff: state.runtime.last_handoff,
    runtime_summary: createRuntimeSummary(state),
  };
}

export function createSessionCompactSurface(
  state: ControlPlaneState,
  options?: { permissionProfile?: string },
): Record<string, unknown> {
  return {
    current_stage: state.workflow.current_stage,
    work_mode: deriveWorkMode(state.workflow.current_stage),
    execution_mode: state.workflow.execution_mode,
    permission_profile: options?.permissionProfile ?? null,
    primary_root: state.session.primary_root,
    attached_roots_count: state.session.attached_roots.length,
    active_spec_artifacts_count: state.session.active_spec_artifacts.length,
    validation_targets_count: state.session.validation_targets.length,
    known_risks_count: state.runtime.known_risks.length,
    open_questions_count: state.runtime.open_questions.length,
    next_recommended_action: state.runtime.next_recommended_action,
    runtime_summary: createRuntimeSummary(state),
  };
}

export function createContextSurface(
  state: ControlPlaneState,
  options?: { permissionProfile?: string },
): Record<string, unknown> {
  return {
    ...createSessionSurface(state, options),
    snapshot: createSnapshot(state),
  };
}

export function createContextExport(
  state: ControlPlaneState,
  options?: { permissionProfile?: string },
): Record<string, unknown> {
  const taskCounts = state.tasks.tasks.reduce(
    (counts, task) => {
      counts.total += 1;
      counts[task.status] += 1;
      return counts;
    },
    { total: 0, open: 0, blocked: 0, done: 0 },
  );

  return {
    current_stage: state.workflow.current_stage,
    work_mode: deriveWorkMode(state.workflow.current_stage),
    execution_mode: state.workflow.execution_mode,
    permission_profile: options?.permissionProfile ?? null,
    primary_root: state.session.primary_root,
    attached_roots: [...state.session.attached_roots],
    active_spec_artifacts: [...state.session.active_spec_artifacts],
    validation_targets: [...state.session.validation_targets],
    known_risks: [...state.runtime.known_risks],
    open_questions: [...state.runtime.open_questions],
    next_recommended_action: state.runtime.next_recommended_action,
    task_counts: taskCounts,
    evidence_counts: {
      verification_entries: state.evidence.verification_entries.length,
      review_entries: state.evidence.review_entries.length,
      mode_decisions: state.evidence.mode_decisions.length,
      openspec_decisions: state.evidence.openspec_decisions.length,
    },
    runtime_summary: createRuntimeSummary(state),
    snapshot: createSnapshot(state),
  };
}

export function startSession(state: ControlPlaneState, primaryRoot: string): ControlPlaneState {
  const next = structuredClone(state) as ControlPlaneState;
  next.session.primary_root = primaryRoot;
  next.session.attached_roots = Array.from(new Set([primaryRoot, ...next.session.attached_roots]));
  next.runtime.next_recommended_action ??= "Run stage.enter plan or session.attach-root before implementation.";
  return next;
}

export function attachRoot(
  state: ControlPlaneState,
  options: { path: string; role: "primary" | "reference" },
): ControlPlaneState {
  const next = structuredClone(state) as ControlPlaneState;
  const path = options.path;
  if (options.role === "primary") {
    next.session.primary_root = path;
  }
  next.session.attached_roots = Array.from(new Set([next.session.primary_root, ...next.session.attached_roots, path]));
  if (!next.runtime.relevant_paths.includes(path)) {
    next.runtime.relevant_paths.push(path);
  }
  return next;
}

export function createSnapshot(state: ControlPlaneState): SessionSnapshot {
  const primary = state.session.primary_root;
  const attached = state.session.attached_roots;
  return {
    primary_root: primary,
    attached_reference_roots: attached.filter((path) => path !== primary),
    current_stage: state.workflow.current_stage,
    relevant_paths: [...state.runtime.relevant_paths],
    active_spec_artifacts: [...state.session.active_spec_artifacts],
  };
}
