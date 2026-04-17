import type { OpenSpecDecision } from "../../shared/types.js";

export type ArtifactLevel = OpenSpecDecision["artifact_level"];

export function assessOpenSpec(
  options: {
    complexity?: "low" | "medium" | "high";
    fileCount?: number;
    behaviorChange?: boolean;
    taskCount?: number;
  },
): OpenSpecDecision {
  const complexity = options.complexity ?? "low";
  const fileCount = options.fileCount ?? 1;
  const behaviorChange = options.behaviorChange ?? false;
  const taskCount = options.taskCount ?? 1;

  let artifact_level: ArtifactLevel = "minimal";
  if (complexity === "high" || fileCount >= 6 || taskCount >= 5) {
    artifact_level = "full";
  } else if (complexity === "medium" || fileCount >= 3 || behaviorChange || taskCount >= 2) {
    artifact_level = "standard";
  }

  const required_artifacts =
    artifact_level === "minimal"
      ? ["spec-note", "validation"]
      : artifact_level === "standard"
        ? ["proposal", "design", "tasks", "validation"]
        : ["proposal", "specs", "design", "tasks", "validation"];

  const external_skill_recommended = artifact_level !== "minimal";
  const external_skill_reason = external_skill_recommended
    ? "Task shape suggests a fuller artifact set; an external OpenSpec skill can help structure it, but remains optional."
    : null;

  return {
    artifact_level,
    external_skill_recommended,
    external_skill_reason,
    required_artifacts,
    readiness_missing: [],
    review_gate_ready: true,
  };
}
