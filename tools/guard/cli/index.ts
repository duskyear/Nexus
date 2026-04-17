import { runGuard } from "./run.js";

function formatText(result: Awaited<ReturnType<typeof runGuard>>): string {
  const lines = [
    `${result.status}: ${result.reason}`,
    `evidence_checked: ${result.evidence_checked.join(", ") || "none"}`,
    `next_step: ${result.next_step}`,
  ];

  if (result.execution_mode) {
    lines.push(`execution_mode: ${result.execution_mode}`);
  }

  if (result.stage) {
    lines.push(`stage: ${result.stage}`);
  }

  if (result.permission_profile) {
    lines.push(`permission_profile: ${result.permission_profile}`);
  }

  if (result.session_context) {
    const ctx = result.session_context as Record<string, unknown>;
    lines.push(`session_primary_root: ${ctx.primary_root}`);
    lines.push(`attached_roots: ${(ctx.attached_roots as string[] | undefined)?.join(", ") ?? "none"}`);
  }

  if (result.session_surface) {
    const surface = result.session_surface as Record<string, unknown>;
    lines.push(`session_surface.current_stage: ${String(surface.current_stage ?? "unknown")}`);
    lines.push(`session_surface.execution_mode: ${String(surface.execution_mode ?? "unknown")}`);
    lines.push(`session_surface.permission_profile: ${String(surface.permission_profile ?? "none")}`);
    lines.push(`session_surface.next_recommended_action: ${String(surface.next_recommended_action ?? "none")}`);
    lines.push(`session_surface.known_risks: ${(surface.known_risks as string[] | undefined)?.join(", ") ?? "none"}`);
    lines.push(`session_surface.open_questions: ${(surface.open_questions as string[] | undefined)?.join(", ") ?? "none"}`);
  }

  if (result.session_compact) {
    const compact = result.session_compact as Record<string, unknown>;
    lines.push(`session_compact.current_stage: ${String(compact.current_stage ?? "unknown")}`);
    lines.push(`session_compact.execution_mode: ${String(compact.execution_mode ?? "unknown")}`);
    lines.push(`session_compact.permission_profile: ${String(compact.permission_profile ?? "none")}`);
    lines.push(`session_compact.primary_root: ${String(compact.primary_root ?? "unknown")}`);
    lines.push(`session_compact.attached_roots_count: ${String(compact.attached_roots_count ?? 0)}`);
    lines.push(`session_compact.next_recommended_action: ${String(compact.next_recommended_action ?? "none")}`);
  }

  if (result.snapshot) {
    const snap = result.snapshot as Record<string, unknown>;
    lines.push(`snapshot_primary_root: ${snap.primary_root}`);
    lines.push(`snapshot_references: ${(snap.attached_reference_roots as string[] | undefined)?.join(", ") ?? "none"}`);
  }

  if (result.context_surface) {
    const surface = result.context_surface as Record<string, unknown>;
    lines.push(`context_surface.current_stage: ${String(surface.current_stage ?? "unknown")}`);
    lines.push(`context_surface.execution_mode: ${String(surface.execution_mode ?? "unknown")}`);
    lines.push(`context_surface.permission_profile: ${String(surface.permission_profile ?? "none")}`);
    lines.push(`context_surface.attached_roots: ${(surface.attached_roots as string[] | undefined)?.join(", ") ?? "none"}`);
    lines.push(`context_surface.active_spec_artifacts: ${(surface.active_spec_artifacts as string[] | undefined)?.join(", ") ?? "none"}`);
    lines.push(`context_surface.validation_targets: ${(surface.validation_targets as string[] | undefined)?.join(", ") ?? "none"}`);
    lines.push(`context_surface.next_recommended_action: ${String(surface.next_recommended_action ?? "none")}`);
  }

  if (result.context_export) {
    const exported = result.context_export as Record<string, unknown>;
    const taskCounts = exported.task_counts as Record<string, unknown> | undefined;
    const evidenceCounts = exported.evidence_counts as Record<string, unknown> | undefined;
    lines.push(`context_export.current_stage: ${String(exported.current_stage ?? "unknown")}`);
    lines.push(`context_export.execution_mode: ${String(exported.execution_mode ?? "unknown")}`);
    lines.push(`context_export.permission_profile: ${String(exported.permission_profile ?? "none")}`);
    lines.push(`context_export.primary_root: ${String(exported.primary_root ?? "unknown")}`);
    lines.push(`context_export.attached_roots: ${(exported.attached_roots as string[] | undefined)?.join(", ") ?? "none"}`);
    if (taskCounts) {
      lines.push(`context_export.task_counts: total=${String(taskCounts.total ?? 0)}, open=${String(taskCounts.open ?? 0)}, blocked=${String(taskCounts.blocked ?? 0)}, done=${String(taskCounts.done ?? 0)}`);
    }
    if (evidenceCounts) {
      lines.push(
        `context_export.evidence_counts: verification=${String(evidenceCounts.verification_entries ?? 0)}, review=${String(evidenceCounts.review_entries ?? 0)}, mode=${String(evidenceCounts.mode_decisions ?? 0)}, openspec=${String(evidenceCounts.openspec_decisions ?? 0)}`,
      );
    }
    lines.push(`context_export.next_recommended_action: ${String(exported.next_recommended_action ?? "none")}`);
  }

  if (result.openspec_decision) {
    const dec = result.openspec_decision as Record<string, unknown>;
    lines.push(`artifact_level: ${dec.artifact_level}`);
    lines.push(`external_skill_recommended: ${dec.external_skill_recommended}`);
  }

  if (result.recommended_skills) {
    const skills = result.recommended_skills as string[];
    lines.push(`recommended_skills: ${skills.join(", ")}`);
  }

  if (result.allowed_skills) {
    const allowed = result.allowed_skills as string[];
    lines.push(`allowed_skills: ${allowed.join(", ")}`);
  }

  if (result.workflow_hints) {
    const hints = result.workflow_hints as string[];
    lines.push(`workflow_hints: ${hints.join(" | ")}`);
  }

  if (result.doctor_checks) {
    const checks = result.doctor_checks as string[];
    lines.push(`doctor_checks: ${checks.join(", ")}`);
  }

  if (result.doctor_findings) {
    const findings = result.doctor_findings as string[];
    lines.push(`doctor_findings: ${findings.join(" | ")}`);
  }

  if (result.doctor_summary) {
    const summary = result.doctor_summary as Record<string, unknown>;
    const formatSection = (key: string) => {
      const section = summary[key] as Record<string, unknown> | undefined;
      if (!section) {
        return;
      }
      const issues = (section.issues as string[] | undefined)?.join(", ") || "none";
      lines.push(`doctor_summary.${key}.status: ${String(section.status ?? "unknown")}`);
      lines.push(`doctor_summary.${key}.issues: ${issues}`);
    };

    formatSection("environment");
    formatSection("method_sources");
    formatSection("workflow");
    formatSection("runtime");
  }

  if (result.doctor_fixable_items) {
    const fixableItems = result.doctor_fixable_items as string[];
    lines.push(`doctor_fixable_items: ${fixableItems.join(" | ") || "none"}`);
  }

  if (result.task_ledger) {
    const ledger = result.task_ledger as { tasks?: Array<Record<string, unknown>> };
    const tasks = ledger.tasks ?? [];
    lines.push(`task_ledger.count: ${tasks.length}`);
    for (const task of tasks.slice(0, 5)) {
      lines.push(`task_ledger.task: ${String(task.id ?? "unknown")} [${String(task.status ?? "unknown")}] ${String(task.title ?? "")}`);
    }
  }

  if (result.usage_summary) {
    const summary = result.usage_summary as Record<string, unknown>;
    const taskCounts = summary.task_counts as Record<string, unknown> | undefined;
    const evidenceCounts = summary.evidence_counts as Record<string, unknown> | undefined;
    lines.push(`usage_summary.current_stage: ${String(summary.current_stage ?? "unknown")}`);
    lines.push(`usage_summary.execution_mode: ${String(summary.execution_mode ?? "unknown")}`);
    lines.push(`usage_summary.permission_profile: ${String(summary.permission_profile ?? "none")}`);
    if (taskCounts) {
      lines.push(`usage_summary.task_counts: total=${String(taskCounts.total ?? 0)}, open=${String(taskCounts.open ?? 0)}, blocked=${String(taskCounts.blocked ?? 0)}, done=${String(taskCounts.done ?? 0)}`);
    }
    if (evidenceCounts) {
      lines.push(
        `usage_summary.evidence_counts: verification=${String(evidenceCounts.verification_entries ?? 0)}, review=${String(evidenceCounts.review_entries ?? 0)}, mode=${String(evidenceCounts.mode_decisions ?? 0)}, openspec=${String(evidenceCounts.openspec_decisions ?? 0)}`,
      );
    }
    lines.push(`usage_summary.next_recommended_action: ${String(summary.next_recommended_action ?? "none")}`);
  }

  if (result.event_log_summary) {
    const summary = result.event_log_summary as Record<string, unknown>;
    const counts = summary.counts as Record<string, unknown> | undefined;
    lines.push(`event_log_summary.total_events: ${String(summary.total_events ?? 0)}`);
    if (counts) {
      lines.push(`event_log_summary.counts: ${Object.entries(counts).map(([key, value]) => `${key}=${String(value)}`).join(", ") || "none"}`);
    }
    if (summary.latest_event) {
      const latest = summary.latest_event as Record<string, unknown>;
      lines.push(`event_log_summary.latest_event.type: ${String(latest.type ?? "unknown")}`);
      lines.push(`event_log_summary.latest_event.reason: ${String(latest.reason ?? "none")}`);
    }
  }

  if (result.install_manifest_path) {
    lines.push(`install_manifest_path: ${result.install_manifest_path}`);
  }

  if (result.method_sources) {
    const methodSources = result.method_sources as Record<string, unknown>;
    lines.push(`method_sources_requested: ${String(methodSources.requested ?? false)}`);
    if (methodSources.superpowers) {
      const superpowers = methodSources.superpowers as Record<string, unknown>;
      lines.push(`superpowers_status: ${String(superpowers.status ?? "unknown")}`);
    }
    if (methodSources.oh_my_codex) {
      const omx = methodSources.oh_my_codex as Record<string, unknown>;
      lines.push(`oh_my_codex_status: ${String(omx.status ?? "unknown")}`);
    }
  }

  return lines.join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const filteredArgs = args.filter((arg) => arg !== "--json");

  try {
    const result = await runGuard(filteredArgs, { cwd: process.cwd() });
    if (asJson) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }

    process.stdout.write(`${formatText(result)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

void main();
