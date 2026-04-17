import { access, readFile, readdir } from "node:fs/promises";
import { execSync } from "node:child_process";
import { constants } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig, loadState } from "../state/store.js";
import { dispatchControlPlaneCommand } from "../../control-plane/registry/commands.js";
import { ensureMethodSources, pathExists, readInstallManifest, writeInstallManifest } from "../../shared/install.mjs";
import {
  applyLegacyHarnessState,
  loadControlPlaneState,
  saveControlPlaneState,
  toLegacyHarnessState,
} from "../../control-plane/state/store.js";
import {
  applyExecutionMode,
  decideMode,
  evaluateClaim,
  evaluateReview,
  evaluateStageTransition,
  revertStage,
  recordAdcCompletion,
  recordLocalRun,
  withVerificationRecorded,
} from "../core/commands.js";
import {
  applyRuntimeCaps,
  evaluateRuntimeCaps,
  shouldEnforceRuntimeCaps,
} from "../../control-plane/core/caps.js";
import { appendEventLog } from "../../control-plane/core/event-log.js";
import type { GuardResult } from "../core/types.js";
import {
  resolvePermissionProfileForStage,
  defaultRuntimeCaps,
  type ExecutionMode,
  type GuardStage,
} from "../schema/config.js";
import type { RuntimeContext } from "../../control-plane/schema/runtime-context.js";
import type { VerificationEvidence } from "../schema/state.js";
import { validateBashCommand } from "../interceptors/bashSecurity.js";


export interface RunGuardOptions {
  cwd: string;
}

const ADC_PATH = join("harness", "AGENT_DESIGN_CARD.md");
const BUNDLED_SKILLS_DIR = fileURLToPath(new URL("../../../skills", import.meta.url));

type SkillSource = "local" | "upstream" | "all";

function getRecommendedSkills(command: string, subcommand: string | undefined, config: Awaited<ReturnType<typeof loadConfig>>): string[] {
  if (command === "session" || command === "context") {
    return config.skill_recommendations.plan ?? [];
  }

  if (command === "openspec" && subcommand === "assess") {
    return config.skill_recommendations.openspec ?? [];
  }

  if (command === "stage" && subcommand) {
    return config.skill_recommendations[subcommand] ?? [];
  }

  if (command === "check" && subcommand) {
    return config.skill_recommendations[subcommand] ?? [];
  }

  if (command === "verify-claim") {
    return config.skill_recommendations.local_run ?? ["verification-before-completion"];
  }

  if (command === "decide-mode" || command === "set-mode") {
    return config.skill_recommendations.implementation ?? [];
  }

  if (command === "record") {
    if (subcommand === "local-run" || subcommand === "adc-complete") {
      return config.skill_recommendations.local_run ?? ["verification-before-completion"];
    }
  }

  return [];
}

function attachWorkflowHints(result: GuardResult, skills: string[]): GuardResult {
  if (skills.length === 0) {
    return result;
  }

  return {
    ...result,
    recommended_skills: skills,
    workflow_hints: [`Recommended skills: ${skills.join(", ")}`],
  };
}

function attachPermissionProfile(
  result: GuardResult,
  permissionProfile: ReturnType<typeof resolvePermissionProfileForStage>,
): GuardResult {
  return {
    ...result,
    permission_profile: permissionProfile,
  };
}

function attachRuntimeCaps(
  result: GuardResult,
  capReport: ReturnType<typeof evaluateRuntimeCaps>,
  promoteStatus = false,
): GuardResult {
  return promoteStatus ? applyRuntimeCaps(result, capReport) : { ...result, runtime_caps: capReport };
}

function summarizeDoctorWorkflow(state: Awaited<ReturnType<typeof loadControlPlaneState>>["workflow"]): {
  status: "PASS" | "WARN" | "BLOCK";
  issues: string[];
  current_stage: string;
  execution_mode: string;
} {
  const issues: string[] = [];

  if (state.current_stage === "implementation" && !state.approved_plan) {
    issues.push("implementation without approved plan");
  }
  if (state.current_stage === "openspec" && !state.openspec_ready) {
    issues.push("openspec without readiness");
  }
  if (state.current_stage === "review1" && !state.openspec_ready) {
    issues.push("review1 without openspec readiness");
  }
  if (state.current_stage === "review2" && !state.review1_passed) {
    issues.push("review2 without review1 approval");
  }
  if (state.current_stage === "review3" && !state.local_run_confirmed) {
    issues.push("review3 without local run confirmation");
  }

  return {
    status: issues.length > 0 ? "WARN" : "PASS",
    issues,
    current_stage: state.current_stage,
    execution_mode: state.execution_mode,
  };
}

function summarizeDoctorRuntime(
  runtime: RuntimeContext,
  runtimeCaps = defaultRuntimeCaps,
  runtimeCapsSource: "config" | "defaulted" | "fallback" = "config",
  runtimeCapsIssue: string | null = null,
): {
  status: "PASS" | "WARN" | "BLOCK";
  issues: string[];
  cap_report: ReturnType<typeof evaluateRuntimeCaps>;
  runtime_caps_source: "config" | "defaulted" | "fallback";
  runtime_caps_issue: string | null;
} {
  const capReport = evaluateRuntimeCaps(runtime, runtimeCaps);
  const issues = [...capReport.cap_warnings, ...capReport.cap_blocks];
  return {
    status: capReport.status,
    issues,
    cap_report: capReport,
    runtime_caps_source: runtimeCapsSource,
    runtime_caps_issue: runtimeCapsIssue,
  };
}

function summarizeDoctorEnvironment(options: {
  harnessVersionExists: boolean;
  guardConfigExists: boolean;
  skillsExists: boolean;
}): {
  status: "PASS" | "WARN" | "BLOCK";
  issues: string[];
} {
  const issues: string[] = [];
  if (!options.harnessVersionExists) {
    issues.push("missing harness.version.json");
  }
  if (!options.guardConfigExists) {
    issues.push("missing harness/guard.config.json");
  }
  if (!options.skillsExists) {
    issues.push("missing skills directory");
  }

  return {
    status: issues.length > 0 ? "WARN" : "PASS",
    issues,
  };
}

function summarizeDoctorMethodSources(options: {
  superpowersVisible: boolean;
  omxStateExists: boolean;
  requested: boolean;
  superpowersStatus?: string;
  omxStatus?: string;
}): {
  status: "PASS" | "WARN" | "BLOCK";
  issues: string[];
} {
  const issues: string[] = [];
  if (!options.superpowersVisible) {
    issues.push("superpowers link missing");
  }
  if (!options.omxStateExists) {
    issues.push("omx project setup missing");
  }
  if (options.requested && options.superpowersStatus && options.superpowersStatus !== "installed") {
    issues.push(`superpowers status is ${options.superpowersStatus}`);
  }
  if (options.requested && options.omxStatus && options.omxStatus !== "installed") {
    issues.push(`oh-my-codex status is ${options.omxStatus}`);
  }

  return {
    status: issues.length > 0 ? "WARN" : "PASS",
    issues,
  };
}

function buildDoctorFixableItems(input: {
  environment: { issues: string[] };
  methodSources: { issues: string[] };
  workflow: { issues: string[] };
  runtime: { issues: string[] };
}): string[] {
  const items = new Set<string>();

  if (input.methodSources.issues.length > 0) {
    items.add("Run doctor --fix to install or repair method sources.");
  }
  if (input.workflow.issues.some((issue) => issue.includes("implementation without approved plan"))) {
    items.add("Approve the plan before continuing implementation.");
  }
  if (input.workflow.issues.some((issue) => issue.includes("review1 without openspec readiness"))) {
    items.add("Finish OpenSpec readiness before review1.");
  }
  if (input.workflow.issues.some((issue) => issue.includes("review2 without review1 approval"))) {
    items.add("Complete review1 before moving through review2.");
  }
  if (input.workflow.issues.some((issue) => issue.includes("review3 without local run confirmation"))) {
    items.add("Record a local run before review3.");
  }
  if (input.runtime.issues.length > 0) {
    items.add("Reduce runtime pressure before pushing more guard commands.");
  }
  if (input.environment.issues.length > 0) {
    items.add("Restore the missing workspace files before continuing.");
  }

  return [...items];
}

function checkSourceCodeModifications(cwd: string): string[] {
  try {
    const output = execSync("git status --porcelain", { cwd, encoding: "utf8", stdio: "pipe" });
    const lines = output.split("\n").filter(l => l.trim().length > 0);
    const sourceExtensions = [".ts", ".js", ".jsx", ".tsx", ".py", ".go", ".java", ".c", ".cpp", ".rs", ".rb", ".php", ".html", ".css"];
    const modifiedSources = lines.map(l => l.substring(3).trim()).filter(file => {
      return sourceExtensions.some(ext => file.endsWith(ext));
    });
    return modifiedSources;
  } catch (err: unknown) {
    return [(err instanceof Error ? err.message : String(err)) || "Git sandbox check failed"];
  }
}

async function performHardArtifactValidation(cwd: string): Promise<string[]> {
  const issues: string[] = [];
  const requiredFiles = ["proposal.md", "design.md", "tasks.md"];
  for (const f of requiredFiles) {
    try {
      const content = await readFile(join(cwd, f), "utf8");
      if (content.trim().length < 50) issues.push(`\`${f}\` is too small to be meaningful`);
      if (content.match(/\[ \]|\- \[ \]/g) === null && f === "tasks.md") issues.push(`\`${f}\` missing checklist`);
      if (content.toLowerCase().includes("tbd")) issues.push(`\`${f}\` contains TBD placeholders`);
    } catch {
      issues.push(`missing \`${f}\``);
    }
  }
  return issues;
}

function combineDoctorStatuses(statuses: Array<"PASS" | "WARN" | "BLOCK">): "PASS" | "WARN" | "BLOCK" {
  if (statuses.includes("BLOCK")) {
    return "BLOCK";
  }

  if (statuses.includes("WARN")) {
    return "WARN";
  }

  return "PASS";
}

async function runDoctor(options: RunGuardOptions, argv: string[]): Promise<GuardResult> {
  const fix = hasFlag(argv, "--fix");
  const homeDir = process.env.USERPROFILE ?? process.env.HOME ?? "";
  const checks: string[] = [];
  const findings: string[] = [];
  let manifest = await readInstallManifest(options.cwd);
  let status: "PASS" | "WARN" | "BLOCK" = "PASS";

  const harnessVersionPath = join(options.cwd, "harness.version.json");
  const guardConfigPath = join(options.cwd, "harness", "guard.config.json");
  const packageJsonPath = join(options.cwd, "package.json");
  const skillsDir = join(options.cwd, "skills");
  const superpowersLink = join(homeDir, ".agents", "skills", "superpowers");
  const omxStatePath = join(options.cwd, ".omx", "setup-scope.json");
  const installManifestPath = join("harness", "install-manifest.json");
  const packageJsonExists = await pathExists(packageJsonPath);

  const harnessVersionExists = await pathExists(harnessVersionPath);
  const guardConfigExists = await pathExists(guardConfigPath);
  const skillsExists = await pathExists(skillsDir);
  const superpowersVisible = await pathExists(superpowersLink);
  const omxStateExists = await pathExists(omxStatePath);

  checks.push("harness.version.json");
  checks.push("harness/guard.config.json");
  checks.push("package.json");
  checks.push("skills/");
  checks.push("superpowers link");
  checks.push(".omx/setup-scope.json");

  const controlPlaneState = await loadControlPlaneState(options.cwd);
  let runtimeCaps = defaultRuntimeCaps;
  let runtimeCapsSource: "config" | "defaulted" | "fallback" = "defaulted";
  let runtimeCapsIssue: string | null = null;
  if (guardConfigExists) {
    try {
      const config = await loadConfig(options.cwd);
      runtimeCaps = config.runtime_caps;
      runtimeCapsSource = "config";
      const rawConfig = JSON.parse(await readFile(guardConfigPath, "utf8")) as Record<string, unknown>;
      if (!Object.prototype.hasOwnProperty.call(rawConfig, "runtime_caps")) {
        runtimeCapsSource = "defaulted";
        runtimeCapsIssue = "runtime caps missing from guard.config.json; using default thresholds.";
      }
    } catch {
      runtimeCaps = defaultRuntimeCaps;
      runtimeCapsSource = "fallback";
      runtimeCapsIssue = "failed to parse runtime caps from guard.config.json; using default thresholds.";
    }
  }
  const runtimeSummary = summarizeDoctorRuntime(
    controlPlaneState.runtime,
    runtimeCaps,
    runtimeCapsSource,
    runtimeCapsIssue,
  );
  const environmentSummary = summarizeDoctorEnvironment({
    harnessVersionExists,
    guardConfigExists,
    skillsExists: skillsExists && packageJsonExists,
  });
  const methodSourcesSummary = summarizeDoctorMethodSources({
    superpowersVisible,
    omxStateExists,
    requested: false,
  });
  const workflowSummary = summarizeDoctorWorkflow(controlPlaneState.workflow);
  if (runtimeCapsIssue) {
    findings.push(runtimeCapsIssue);
  }

  if (!harnessVersionExists || !guardConfigExists) {
    const fixableItems = buildDoctorFixableItems({
      environment: { issues: environmentSummary.issues },
      methodSources: { issues: methodSourcesSummary.issues },
      workflow: { issues: workflowSummary.issues },
      runtime: { issues: runtimeSummary.issues },
    });

    return {
      status: "BLOCK",
      reason: "harness-kit is not initialized in this project.",
      evidence_checked: checks,
      next_step: "Run bootstrap first, then rerun doctor.",
      stage: "doctor",
      doctor_checks: checks,
      doctor_findings: [
        !harnessVersionExists ? "missing harness.version.json" : "harness.version.json present",
        !guardConfigExists ? "missing harness/guard.config.json" : "harness/guard.config.json present",
      ],
      doctor_summary: {
        environment: environmentSummary,
        method_sources: methodSourcesSummary,
        workflow: workflowSummary,
        runtime: runtimeSummary,
      },
      doctor_fixable_items: fixableItems,
      install_manifest_path: installManifestPath,
    };
  }

  if (fix) {
    try {
      const installed = await ensureMethodSources({
        cwd: options.cwd,
        homeDir,
        sourceDir: readFlag(argv, "--superpowers-source-dir") ?? process.env.HARNESS_KIT_SUPERPOWERS_SOURCE_DIR,
        repoUrl: process.env.HARNESS_KIT_SUPERPOWERS_REPO_URL,
        command: readFlag(argv, "--omx-command") ?? process.env.HARNESS_KIT_OMX_COMMAND,
        verbose: hasFlag(argv, "--verbose"),
      });
      manifest = {
        template_name: "default",
        install_mode: "full",
        template_version: "0.1.0",
        cli_version: "0.1.0",
        installed_at: new Date().toISOString(),
        method_sources: {
          requested: true,
          superpowers: {
            status: installed.superpowers.status,
            source: installed.superpowers.source,
            clone_dir: installed.superpowers.cloneDir,
            skills_link: installed.superpowers.skillsLink,
          },
          oh_my_codex: {
            status: installed.ohMyCodex.status,
            command: installed.ohMyCodex.command,
            scope: installed.ohMyCodex.scope,
          },
        },
      };
      await writeInstallManifest(options.cwd, manifest);
      findings.push("installed superpowers method source");
      findings.push("ran omx setup for project scope");
    } catch (error) {
      status = "WARN";
      findings.push(error instanceof Error ? error.message : String(error));
    }
  }

  const refreshedSkillsExists = await pathExists(skillsDir);
  const refreshedSuperpowersVisible = await pathExists(superpowersLink);
  const refreshedOmxStateExists = await pathExists(omxStatePath);

  const manifestNow = manifest ?? (await readInstallManifest(options.cwd));
  const methodSources = (manifestNow as Record<string, unknown> | null)?.method_sources as
    | {
        requested?: boolean;
        superpowers?: { status?: string };
        oh_my_codex?: { status?: string };
      }
    | undefined;

  if (!refreshedSkillsExists || !packageJsonExists) {
    status = status === "BLOCK" ? status : "WARN";
  }

  const refreshedEnvironmentSummary = summarizeDoctorEnvironment({
    harnessVersionExists,
    guardConfigExists,
    skillsExists: refreshedSkillsExists && packageJsonExists,
  });
  const refreshedMethodSourcesSummary = summarizeDoctorMethodSources({
    superpowersVisible: refreshedSuperpowersVisible,
    omxStateExists: refreshedOmxStateExists,
    requested: Boolean(methodSources?.requested),
    superpowersStatus: methodSources?.superpowers?.status,
    omxStatus: methodSources?.oh_my_codex?.status,
  });
  const refreshedWorkflowSummary = summarizeDoctorWorkflow(controlPlaneState.workflow);
  const refreshedRuntimeSummary = summarizeDoctorRuntime(controlPlaneState.runtime);

  if (refreshedSkillsExists) {
    findings.push("skills directory present");
  } else {
    findings.push("skills directory missing");
  }

  if (refreshedSuperpowersVisible) {
    findings.push("superpowers link present");
  } else {
    findings.push("superpowers link missing");
  }

  if (refreshedOmxStateExists) {
    findings.push("omx project setup present");
  } else {
    findings.push("omx project setup missing");
  }

  const doctorSummary = {
    environment: refreshedEnvironmentSummary,
    method_sources: refreshedMethodSourcesSummary,
    workflow: refreshedWorkflowSummary,
    runtime: refreshedRuntimeSummary,
  };
  const doctorFixableItems = buildDoctorFixableItems({
    environment: { issues: refreshedEnvironmentSummary.issues },
    methodSources: { issues: refreshedMethodSourcesSummary.issues },
    workflow: { issues: refreshedWorkflowSummary.issues },
    runtime: { issues: refreshedRuntimeSummary.issues },
  });

  return {
    status: combineDoctorStatuses([
      status,
      refreshedEnvironmentSummary.status,
      refreshedMethodSourcesSummary.status,
      refreshedWorkflowSummary.status,
      refreshedRuntimeSummary.status,
    ]),
    reason:
      status === "PASS"
        ? "harness installation and method sources look healthy."
        : "harness installation is partial or missing method sources.",
    evidence_checked: checks,
    next_step:
      status === "PASS"
        ? "Run guard skills or start the workflow."
        : "Run doctor --fix again or install the missing method sources.",
    stage: "doctor",
    doctor_checks: checks,
    doctor_findings: findings,
    doctor_summary: doctorSummary,
    doctor_fixable_items: doctorFixableItems,
    install_manifest_path: installManifestPath,
    method_sources: methodSources ?? null,
  };
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

function readIntegerFlags(args: string[], flag: string): number[] {
  return readFlags(args, flag).map((value) => Number.parseInt(value, 10)).filter((value) => !Number.isNaN(value));
}

function parseSkillSource(value: string | undefined): SkillSource {
  if (!value || value === "all") {
    return "all";
  }

  if (value === "local" || value === "upstream") {
    return value;
  }

  throw new Error("Unsupported skill source '" + value + "'. Expected one of: local, upstream, all.");
}

function parseStage(value: string | undefined): GuardStage {
  if (
    value === "plan" ||
    value === "openspec" ||
    value === "review1" ||
    value === "implementation" ||
    value === "review2" ||
    value === "local_run" ||
    value === "review3" ||
    value === "hardening"
  ) {
    return value;
  }

  if (!value) {
    throw new Error("guard stage requires a subcommand: plan, openspec, review1, implementation, review2, local_run, review3, hardening.");
  }

  throw new Error(`Unsupported guard stage '${value}'. Expected one of: plan, openspec, review1, implementation, review2, local_run, review3, hardening.`);
}

function parseExecutionMode(value: string | undefined): ExecutionMode | undefined {
  if (!value) {
    return undefined;
  }

  if (value === "single-agent" || value === "role-based single-agent" || value === "multi-agent") {
    return value;
  }

  throw new Error("Unsupported execution mode '" + value + "'. Expected one of: single-agent, role-based single-agent, multi-agent.");
}

async function collectSkillNames(skillDir: string): Promise<Set<string>> {
  try {
    const entries = await readdir(skillDir, { withFileTypes: true });
    return new Set(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name));
  } catch {
    return new Set();
  }
}

async function getLocalSkillNames(cwd: string): Promise<Set<string>> {
  const localSkills = await collectSkillNames(join(cwd, "skills"));
  const bundledSkills = await collectSkillNames(BUNDLED_SKILLS_DIR);
  return new Set([...localSkills, ...bundledSkills]);
}

function filterSkillsBySource(skills: string[], source: SkillSource, localSkillNames: Set<string>): string[] {
  if (source === "all") {
    return skills;
  }

  const matchesLocal = (skill: string) => localSkillNames.has(skill);
  return source === "local" ? skills.filter(matchesLocal) : skills.filter((skill) => !matchesLocal(skill));
}

function buildVerificationEvidence(
  commands: string[],
  exitCodes: number[],
  summaries: string[],
): { evidenceAligned: boolean; evidenceItems: VerificationEvidence[] } {
  if (commands.length === 0 && exitCodes.length === 0 && summaries.length === 0) {
    return { evidenceAligned: true, evidenceItems: [] };
  }

  if (commands.length !== exitCodes.length || commands.length !== summaries.length) {
    return { evidenceAligned: false, evidenceItems: [] };
  }

  return {
    evidenceAligned: true,
    evidenceItems: commands.map((command, index) => ({
      command,
      exit_code: exitCodes[index],
      summary: summaries[index],
    })),
  };
}

async function readAdcStatus(cwd: string): Promise<{ exists: boolean; meaningful: boolean }> {
  const fullPath = join(cwd, ADC_PATH);
  try {
    await access(fullPath, constants.F_OK);
  } catch {
    return { exists: false, meaningful: false };
  }

  const raw = (await readFile(fullPath, "utf8")).trim();
  const normalized = raw.toLowerCase();
  const meaningful = raw.length > 0 && normalized !== "complete adc" && !normalized.includes("placeholder");
  return { exists: true, meaningful };
}

function missingStateResult(): GuardResult {
  return {
    status: "BLOCK",
    reason: "workflow state is missing.",
    evidence_checked: ["state file"],
    next_step: "Run guard stage plan first to initialize workflow state.",
    stage: "plan",
  };
}

function appendModeDecision(
  state: Awaited<ReturnType<typeof loadControlPlaneState>>,
  entry: {
    mode: string;
    complexity: string;
    approved_plan: boolean;
    independent_subtasks?: boolean;
    reduced_context_pollution?: boolean;
    status: "PASS" | "WARN" | "BLOCK";
    reason: string;
  },
) {
  const next = structuredClone(state);
  next.evidence.mode_decisions.push({
    ...entry,
    recorded_at: new Date().toISOString(),
  });
  return next;
}

function appendReviewDecision(
  state: Awaited<ReturnType<typeof loadControlPlaneState>>,
  entry: {
    gate: "review1" | "review2" | "review3";
    status: "pass" | "warn" | "block" | "unknown";
    scope_drift?: boolean;
    design_drift?: boolean;
    mode_downgrade_needed?: boolean;
    leftover_risk?: boolean;
    reason: string;
  },
) {
  const next = structuredClone(state);
  next.evidence.review_entries.push({
    ...entry,
    recorded_at: new Date().toISOString(),
  });
  return next;
}

function attachAllowedSkills(result: GuardResult, allowedSkills: string[]): GuardResult {
  return { ...result, allowed_skills: allowedSkills };
}

export async function runGuard(argv: string[], options: RunGuardOptions): Promise<GuardResult> {
  const [command, subcommand] = argv;

  if (!command) {
    throw new Error("No guard command provided.");
  }

  if (command === "doctor") {
    return runDoctor(options, argv);
  }

  const config = await loadConfig(options.cwd);

  const controlPlaneState = await loadControlPlaneState(options.cwd);
  
  if (
    controlPlaneState.workflow.active_operator === "codex" &&
    command !== "yield" &&
    command !== "doctor" &&
    command !== "session" &&
    command !== "context" &&
    command !== "task" &&
    command !== "usage:summary" &&
    command !== "event:summary"
  ) {
    return {
      status: "BLOCK",
      reason: `Control is currently locked to Codex (Reason: ${controlPlaneState.workflow.operator_lock_reason ?? "unknown"}).`,
      evidence_checked: ["active_operator"],
      next_step: "Run npm run harness:yield to return control to the IDE before running this command.",
      stage: controlPlaneState.workflow.current_stage,
    };
  }

  const legacyState = await loadState(options.cwd);
  const runtimeCapReport = evaluateRuntimeCaps(controlPlaneState.runtime, config.runtime_caps);
  const enforceRuntimeCaps = shouldEnforceRuntimeCaps(command, subcommand);

  if (enforceRuntimeCaps && runtimeCapReport.status === "BLOCK") {
    const permissionProfile =
      command === "skills"
        ? undefined
        : resolvePermissionProfileForStage(config, controlPlaneState.workflow.current_stage);
    const blockedResult: GuardResult = {
      status: "BLOCK",
      reason: runtimeCapReport.reason,
      evidence_checked: runtimeCapReport.evidence_checked,
      next_step: runtimeCapReport.next_step,
      stage: controlPlaneState.workflow.current_stage,
    };
    return permissionProfile
      ? attachAllowedSkills(attachPermissionProfile(attachRuntimeCaps(blockedResult, runtimeCapReport, true), permissionProfile), config.allowed_skills[controlPlaneState.workflow.current_stage] ?? ["*"])
      : attachAllowedSkills(attachRuntimeCaps(blockedResult, runtimeCapReport, true), config.allowed_skills[controlPlaneState.workflow.current_stage] ?? ["*"]);
  }

  if (command === "skills") {
    const stage = (readFlag(argv, "--stage") as GuardStage | undefined) ?? controlPlaneState.workflow.current_stage;
    const source = parseSkillSource(readFlag(argv, "--source"));
    const localSkillNames = await getLocalSkillNames(options.cwd);
    const recommendedSkills = filterSkillsBySource(
      stage ? config.skill_recommendations[stage] ?? [] : [],
      source,
      localSkillNames,
    );
    const sourceLabel = source === "all" ? "" : ` ${source}`;
    const permissionProfile = stage ? resolvePermissionProfileForStage(config, stage) : undefined;
    const result: GuardResult = {
      status: "PASS",
      reason: recommendedSkills.length > 0
        ? `skill recommendations available for ${stage}${sourceLabel}.`
        : `No${sourceLabel} skill recommendations are configured for ${stage}.`,
      evidence_checked: ["skill_recommendations", "workflow_state", "skill_sources"],
      next_step: recommendedSkills.length > 0
        ? `Use the recommended${sourceLabel} skills for ${stage}.`
        : `No${sourceLabel} skill recommendations are configured for ${stage}.`,
      stage,
      recommended_skills: recommendedSkills,
      workflow_hints: recommendedSkills.length > 0
        ? [`Recommended${sourceLabel} skills: ${recommendedSkills.join(", ")}`]
        : [`No${sourceLabel} skill recommendations are configured for ${stage}.`],
    };

    return attachAllowedSkills(
      attachPermissionProfile(
        attachRuntimeCaps(result, runtimeCapReport, false),
        permissionProfile ?? resolvePermissionProfileForStage(config, controlPlaneState.workflow.current_stage),
      ),
      stage ? (config.allowed_skills[stage] ?? ["*"]) : (config.allowed_skills[controlPlaneState.workflow.current_stage] ?? ["*"])
    );
  }

  const controlPlaneResult = await dispatchControlPlaneCommand(argv, {
    cwd: options.cwd,
    state: controlPlaneState,
  });
  if (controlPlaneResult) {
    const recommendedSkills = getRecommendedSkills(command, subcommand, config);
    const result = attachRuntimeCaps(
      attachWorkflowHints(controlPlaneResult.result, recommendedSkills),
      runtimeCapReport,
      enforceRuntimeCaps,
    );
    const stage = controlPlaneResult.nextState?.workflow.current_stage ?? controlPlaneState.workflow.current_stage;
    const withPermissionProfile = attachPermissionProfile(result, resolvePermissionProfileForStage(config, stage as GuardStage));
    if (command === "stage") {
      await appendEventLog(options.cwd, {
        type: "stage_entered",
        stage,
        status: result.status,
        reason: result.reason,
        recorded_at: new Date().toISOString(),
      });
    }
    if (command === "check" && subcommand) {
      await appendEventLog(options.cwd, {
        type: result.status === "PASS" ? "review_passed" : "review_blocked",
        gate: subcommand as "review1" | "review2" | "review3",
        status: result.status,
        reason: result.reason,
        recorded_at: new Date().toISOString(),
      });
    }
    if (controlPlaneResult.nextState) {
      await saveControlPlaneState(options.cwd, controlPlaneResult.nextState);
    }
    return withPermissionProfile;
  }

  if (command === "decide-mode") {
    const result = decideMode(config, {
      complexity: readFlag(argv, "--complexity"),
      approvedPlan: hasFlag(argv, "--approved-plan"),
      independentSubtasks: hasFlag(argv, "--independent-subtasks"),
      reducedContextPollution: hasFlag(argv, "--reduced-context-pollution"),
      requestedMode: parseExecutionMode(readFlag(argv, "--requested-mode")),
    });
    const recommendedSkills = getRecommendedSkills(command, subcommand, config);
    const permissionProfile = resolvePermissionProfileForStage(config, controlPlaneState.workflow.current_stage);
    const nextState = appendModeDecision(controlPlaneState, {
      mode: result.execution_mode ?? config.execution_mode_rules.default,
      complexity: readFlag(argv, "--complexity") ?? "low",
      approved_plan: hasFlag(argv, "--approved-plan"),
      independent_subtasks: hasFlag(argv, "--independent-subtasks"),
      reduced_context_pollution: hasFlag(argv, "--reduced-context-pollution"),
      status: result.status,
      reason: result.reason,
    });
    await saveControlPlaneState(options.cwd, nextState);
    return attachAllowedSkills(
      attachPermissionProfile(
        attachRuntimeCaps(attachWorkflowHints(result, recommendedSkills), runtimeCapReport, true),
        permissionProfile,
      ),
      config.allowed_skills[controlPlaneState.workflow.current_stage] ?? ["*"]
    );
  }

  if (command === "stage") {
    if (subcommand === "revert") {
      const targetStageArg = argv[2];
      const targetStage = parseStage(targetStageArg);
      const { result, nextState } = revertStage(config, legacyState ?? {
        current_stage: "plan",
        approved_plan: false,
        openspec_ready: false,
        review1_passed: false,
        review2_last_status: "unknown",
        local_run_confirmed: false,
        review3_passed: false,
        execution_mode: "single-agent",
        adc_required: false,
        adc_completed: false,
        last_verification_claim: null,
        last_verification_evidence: []
      }, targetStage);
      if (nextState && result.status !== "BLOCK") {
        await saveControlPlaneState(options.cwd, applyLegacyHarnessState(controlPlaneState, nextState));
      }
      return attachAllowedSkills(
        attachPermissionProfile(
          attachRuntimeCaps(result, runtimeCapReport, true),
          resolvePermissionProfileForStage(config, targetStage),
        ),
        config.allowed_skills[targetStage] ?? ["*"]
      );
    }

    const targetStage = parseStage(subcommand);
    const currentState = legacyState;

    if (targetStage === "openspec" || targetStage === "review1") {
      const dirtySources = checkSourceCodeModifications(options.cwd);
      if (dirtySources.length > 0) {
        const result: GuardResult = {
          status: "BLOCK",
          reason: `Sandboxing Error: Illegally modified source codes detected during pure-design phase (${targetStage}): ${dirtySources.join(", ")}`,
          evidence_checked: ["git worktree"],
          next_step: "Use git restore to discard rogue source code alterations before proceeding with design phases.",
          stage: currentState?.current_stage ?? "plan",
        };
        const recommendedSkills = getRecommendedSkills(command, targetStage, config);
        const stageResult = attachAllowedSkills(
          attachPermissionProfile(
            attachRuntimeCaps(attachWorkflowHints(result, recommendedSkills), runtimeCapReport, true),
            resolvePermissionProfileForStage(config, result.stage as GuardStage),
          ),
          config.allowed_skills[result.stage as GuardStage] ?? ["*"]
        );
        await appendEventLog(options.cwd, {
          type: "stage_entered",
          stage: targetStage,
          status: stageResult.status,
          reason: stageResult.reason,
          recorded_at: new Date().toISOString(),
        });
        return stageResult;
      }
    }

    if (targetStage === "review1") {
      const artifactIssues = await performHardArtifactValidation(options.cwd);
      if (artifactIssues.length > 0) {
        const result: GuardResult = {
          status: "BLOCK",
          reason: `Hard artifact validation failed: ${artifactIssues.join(", ")}.`,
          evidence_checked: ["proposal.md", "design.md", "tasks.md"],
          next_step: "Fix or create the required OpenSpec artifacts with real non-placeholder content before entering review1.",
          stage: currentState?.current_stage ?? "plan",
        };
        const recommendedSkills = getRecommendedSkills(command, targetStage, config);
        const stageResult = attachAllowedSkills(
          attachPermissionProfile(
            attachRuntimeCaps(attachWorkflowHints(result, recommendedSkills), runtimeCapReport, true),
            resolvePermissionProfileForStage(config, result.stage as GuardStage),
          ),
          config.allowed_skills[result.stage as GuardStage] ?? ["*"]
        );
        await appendEventLog(options.cwd, {
          type: "stage_entered",
          stage: targetStage,
          status: stageResult.status,
          reason: stageResult.reason,
          recorded_at: new Date().toISOString(),
        });
        return stageResult;
      }
    }

    const { result, nextState } = evaluateStageTransition(config, currentState, targetStage, {
      planFields: readFlags(argv, "--plan-field"),
      highRiskChanges: readFlags(argv, "--high-risk-change"),
      confirmedHighRisk: hasFlag(argv, "--confirmed-high-risk"),
      openspecReady: readFlags(argv, "--openspec-ready"),
    });
    const recommendedSkills = getRecommendedSkills(command, targetStage, config);
    if (nextState && result.status !== "BLOCK") {
      await saveControlPlaneState(options.cwd, applyLegacyHarnessState(controlPlaneState, nextState));
    }
    const stageResult = attachAllowedSkills(
      attachPermissionProfile(
        attachRuntimeCaps(attachWorkflowHints(result, recommendedSkills), runtimeCapReport, true),
        resolvePermissionProfileForStage(config, targetStage),
      ),
      config.allowed_skills[targetStage] ?? ["*"]
    );
    await appendEventLog(options.cwd, {
      type: "stage_entered",
      stage: targetStage,
      status: stageResult.status,
      reason: stageResult.reason,
      recorded_at: new Date().toISOString(),
    });
    if (runtimeCapReport.status !== "PASS") {
      await appendEventLog(options.cwd, {
        type: runtimeCapReport.status === "BLOCK" ? "cap_exceeded" : "cap_warning",
        status: runtimeCapReport.status,
        reason: runtimeCapReport.reason,
        recorded_at: new Date().toISOString(),
      });
    }
    return stageResult;
  }

  if (command === "check") {
    if (subcommand !== "review1" && subcommand !== "review2" && subcommand !== "review3") {
      throw new Error("guard check requires a review gate subcommand: review1, review2, or review3.");
    }

    if (subcommand === "review1") {
      const dirtySources = checkSourceCodeModifications(options.cwd);
      if (dirtySources.length > 0) {
        const result: GuardResult = {
          status: "BLOCK",
          reason: `Sandboxing Error: Illegally modified source codes detected before review1: ${dirtySources.join(", ")}`,
          evidence_checked: ["git worktree"],
          next_step: "Discard rogue source code edits. Implementation is only permitted AFTER passing review1.",
          stage: controlPlaneState.workflow.current_stage,
        };
        const recommendedSkills = getRecommendedSkills(command, subcommand, config);
        const reviewResult = attachAllowedSkills(
          attachPermissionProfile(
            attachRuntimeCaps(attachWorkflowHints(result, recommendedSkills), runtimeCapReport, true),
            resolvePermissionProfileForStage(config, controlPlaneState.workflow.current_stage),
          ),
          config.allowed_skills[controlPlaneState.workflow.current_stage] ?? ["*"]
        );
        const nextControlPlaneState = appendReviewDecision(controlPlaneState, {
          gate: subcommand,
          status: "block",
          reason: result.reason,
        });
        await saveControlPlaneState(options.cwd, nextControlPlaneState);
        await appendEventLog(options.cwd, {
          type: "review_blocked",
          gate: subcommand,
          status: reviewResult.status,
          reason: reviewResult.reason,
          recorded_at: new Date().toISOString(),
        });
        return reviewResult;
      }

      const artifactIssues = await performHardArtifactValidation(options.cwd);
      if (artifactIssues.length > 0) {
        const result: GuardResult = {
          status: "BLOCK",
          reason: `Hard artifact validation failed: ${artifactIssues.join(", ")}.`,
          evidence_checked: ["proposal.md", "design.md", "tasks.md"],
          next_step: "Fix or create the required OpenSpec artifacts with real non-placeholder content.",
          stage: controlPlaneState.workflow.current_stage,
        };
        const recommendedSkills = getRecommendedSkills(command, subcommand, config);
        const reviewResult = attachAllowedSkills(
          attachPermissionProfile(
            attachRuntimeCaps(attachWorkflowHints(result, recommendedSkills), runtimeCapReport, true),
            resolvePermissionProfileForStage(config, controlPlaneState.workflow.current_stage),
          ),
          config.allowed_skills[controlPlaneState.workflow.current_stage] ?? ["*"]
        );
        const nextControlPlaneState = appendReviewDecision(controlPlaneState, {
          gate: subcommand,
          status: "block",
          reason: result.reason,
        });
        await saveControlPlaneState(options.cwd, nextControlPlaneState);
        await appendEventLog(options.cwd, {
          type: "review_blocked",
          gate: subcommand,
          status: reviewResult.status,
          reason: reviewResult.reason,
          recorded_at: new Date().toISOString(),
        });
        return reviewResult;
      }
    }

    const state = legacyState ?? toLegacyHarnessState(controlPlaneState);
    const { result, nextState } = evaluateReview(subcommand, state, {
      scopeDrift: hasFlag(argv, "--scope-drift"),
      designDrift: hasFlag(argv, "--design-drift"),
      modeDowngradeNeeded: hasFlag(argv, "--mode-downgrade-needed"),
      leftoverRisk: hasFlag(argv, "--leftover-risk"),
    });
    const recommendedSkills = getRecommendedSkills(command, subcommand, config);
    const nextControlPlaneState = appendReviewDecision(
      applyLegacyHarnessState(controlPlaneState, nextState),
      {
        gate: subcommand,
        status: result.status.toLowerCase() as "pass" | "warn" | "block" | "unknown",
        scope_drift: hasFlag(argv, "--scope-drift") || undefined,
        design_drift: hasFlag(argv, "--design-drift") || undefined,
        mode_downgrade_needed: hasFlag(argv, "--mode-downgrade-needed") || undefined,
        leftover_risk: hasFlag(argv, "--leftover-risk") || undefined,
        reason: result.reason,
      },
    );
    await saveControlPlaneState(options.cwd, nextControlPlaneState);
    const reviewResult = attachAllowedSkills(
      attachPermissionProfile(
        attachRuntimeCaps(attachWorkflowHints(result, recommendedSkills), runtimeCapReport, true),
        resolvePermissionProfileForStage(config, subcommand),
      ),
      config.allowed_skills[subcommand] ?? ["*"]
    );
    await appendEventLog(options.cwd, {
      type: result.status === "PASS" ? "review_passed" : "review_blocked",
      gate: subcommand,
      status: reviewResult.status,
      reason: reviewResult.reason,
      recorded_at: new Date().toISOString(),
    });
    if (runtimeCapReport.status !== "PASS") {
      await appendEventLog(options.cwd, {
        type: runtimeCapReport.status === "BLOCK" ? "cap_exceeded" : "cap_warning",
        status: runtimeCapReport.status,
        reason: runtimeCapReport.reason,
        recorded_at: new Date().toISOString(),
      });
    }
    return reviewResult;
  }

  if (command === "verify-claim") {
    const claim = readFlag(argv, "--claim");
    const evidenceCount = Number.parseInt(readFlag(argv, "--evidence-count") ?? "0", 10);
    const structuredEvidence = buildVerificationEvidence(
      readFlags(argv, "--evidence-command"),
      readIntegerFlags(argv, "--evidence-exit-code"),
      readFlags(argv, "--evidence-summary"),
    );
    const result = evaluateClaim(config, {
      claim: readFlag(argv, "--claim"),
      evidenceCount,
      evidenceItems: structuredEvidence.evidenceItems,
      evidenceAligned: structuredEvidence.evidenceAligned,
    });
    const recommendedSkills = getRecommendedSkills(command, subcommand, config);

    if (result.status !== "BLOCK") {
      const state = legacyState ?? toLegacyHarnessState(controlPlaneState);
      const nextLegacy = withVerificationRecorded(state, { claim, evidenceItems: structuredEvidence.evidenceItems });
      await saveControlPlaneState(options.cwd, applyLegacyHarnessState(controlPlaneState, nextLegacy));
    }

    await appendEventLog(options.cwd, {
      type: result.status === "PASS" ? "claim_verified" : "claim_blocked",
      claim: claim ?? "unknown",
      status: result.status,
      reason: result.reason,
      recorded_at: new Date().toISOString(),
    });

    return attachPermissionProfile(
      attachRuntimeCaps(attachWorkflowHints(result, recommendedSkills), runtimeCapReport, true),
      resolvePermissionProfileForStage(config, controlPlaneState.workflow.current_stage),
    );
  }

  if (command === "set-mode") {
    if (!legacyState) {
      return missingStateResult();
    }
    const { result, nextState } = applyExecutionMode(config, legacyState, {
      mode: parseExecutionMode(readFlag(argv, "--mode")),
      complexity: readFlag(argv, "--complexity"),
      approvedPlan: hasFlag(argv, "--approved-plan"),
      independentSubtasks: hasFlag(argv, "--independent-subtasks"),
      reducedContextPollution: hasFlag(argv, "--reduced-context-pollution"),
    });
    const recommendedSkills = getRecommendedSkills(command, subcommand, config);
    const nextControlPlaneState = appendModeDecision(
      applyLegacyHarnessState(controlPlaneState, nextState),
      {
        mode: result.execution_mode ?? nextState.execution_mode,
        complexity: readFlag(argv, "--complexity") ?? "low",
        approved_plan: hasFlag(argv, "--approved-plan"),
        independent_subtasks: hasFlag(argv, "--independent-subtasks"),
        reduced_context_pollution: hasFlag(argv, "--reduced-context-pollution"),
        status: result.status,
        reason: result.reason,
      },
    );
    await saveControlPlaneState(options.cwd, nextControlPlaneState);
    return attachPermissionProfile(
      attachRuntimeCaps(attachWorkflowHints(result, recommendedSkills), runtimeCapReport, true),
      resolvePermissionProfileForStage(config, legacyState.current_stage),
    );
  }

  if (command === "record") {
    if (!legacyState) {
      return missingStateResult();
    }
    const state = legacyState;

    if (subcommand === "local-run") {
      const { result, nextState } = recordLocalRun(state);
      const recommendedSkills = getRecommendedSkills(command, subcommand, config);
      if (result.status !== "BLOCK") {
        await saveControlPlaneState(options.cwd, applyLegacyHarnessState(controlPlaneState, nextState));
      }
      return attachPermissionProfile(
        attachRuntimeCaps(attachWorkflowHints(result, recommendedSkills), runtimeCapReport, true),
        resolvePermissionProfileForStage(config, state.current_stage),
      );
    }

    if (subcommand === "adc-complete") {
      const adcStatus = await readAdcStatus(options.cwd);
      const { result, nextState } = recordAdcCompletion(state, {
        adcExists: adcStatus.exists,
        adcMeaningful: adcStatus.meaningful,
      });
      const recommendedSkills = getRecommendedSkills(command, subcommand, config);
      if (result.status !== "BLOCK") {
        await saveControlPlaneState(options.cwd, applyLegacyHarnessState(controlPlaneState, nextState));
      }
      return attachPermissionProfile(
        attachRuntimeCaps(attachWorkflowHints(result, recommendedSkills), runtimeCapReport, true),
        resolvePermissionProfileForStage(config, state.current_stage),
      );
    }

    throw new Error(`Unsupported record target '${subcommand ?? ""}'.`);
  }

  if (command === "delegate") {
    const reason = readFlag(argv, "--reason") ?? "Handoff to Codex execution";
    const nextState = structuredClone(controlPlaneState) as ControlPlaneState;
    nextState.workflow.active_operator = "codex";
    nextState.workflow.operator_lock_reason = reason;
    await saveControlPlaneState(options.cwd, nextState);
    return attachPermissionProfile(
      {
        status: "PASS",
        reason: "Control delegated to Codex.",
        evidence_checked: ["workflow_state"],
        next_step: "Run Codex in desktop or terminal.",
        stage: controlPlaneState.workflow.current_stage,
      },
      resolvePermissionProfileForStage(config, controlPlaneState.workflow.current_stage),
    );
  }

  if (command === "yield") {
    const nextState = structuredClone(controlPlaneState) as ControlPlaneState;
    nextState.workflow.active_operator = "ide";
    nextState.workflow.operator_lock_reason = null;
    await saveControlPlaneState(options.cwd, nextState);
    return attachPermissionProfile(
      {
        status: "PASS",
        reason: "Control returned to IDE.",
        evidence_checked: ["workflow_state"],
        next_step: "Continue testing and verification in IDE.",
        stage: controlPlaneState.workflow.current_stage,
      },
      resolvePermissionProfileForStage(config, controlPlaneState.workflow.current_stage),
    );
  }

  if (command === "exec") {
    const isDanger = hasFlag(argv, "--danger");
    const linkTaskId = readFlag(argv, "--link-task");
    // Filter out our custom flags before executing shellCmd
    const filteredShellArgs = argv.slice(1).filter(arg => arg !== "--danger" && arg !== "--link-task" && arg !== linkTaskId);
    const shellCmd = filteredShellArgs.join(" ");

    if (!shellCmd) {
      return {
        status: "BLOCK",
        reason: "No command provided to exec.",
        evidence_checked: [],
        next_step: "Provide a shell command to execute.",
        stage: controlPlaneState.workflow.current_stage,
      };
    }

    // Determine security level based on stage
    let securityLevel: SecurityLevel = "WorkspaceWrite";
    const currentStage = controlPlaneState.workflow.current_stage;
    if (["plan", "openspec", "review1", "review2", "review3"].includes(currentStage)) {
      securityLevel = "ReadOnly";
    }
    if (isDanger) {
      securityLevel = "DangerFullAccess";
    }

    const { passed, reason, matchedString } = validateBashCommand(shellCmd, securityLevel);

    if (!passed) {
      return {
        status: "BLOCK",
        reason: `Command rejected by Bash Defender (${securityLevel}): ${reason}${matchedString ? ` (Matched: ${matchedString})` : ""}`,
        evidence_checked: ["bash_security"],
        next_step: isDanger ? "Wait, --danger was set but still rejected? Check implementation." : "Use --danger to bypass if you are the operator, or re-verify the command.",
        stage: controlPlaneState.workflow.current_stage,
      };
    }

    try {
       const output = execSync(shellCmd, { cwd: options.cwd, encoding: "utf8", stdio: "pipe" });
       
       // Handle task linking if requested
       if (linkTaskId) {
         const linkedTask = await dispatchControlPlaneCommand(["task", "link-evidence", "--id", linkTaskId, "--evidence-ref", `exec-output-${Date.now()}`], {
           cwd: options.cwd,
           state: controlPlaneState
         });
         if (linkedTask?.nextState) {
           await saveControlPlaneState(options.cwd, linkedTask.nextState);
         }
       }

       return {
         status: "PASS",
         reason: `Bash command executed successfully (Level: ${securityLevel}).\nOutput:\n${output.trim()}`,
         evidence_checked: ["bash_security"],
         next_step: "Review the output and decide the next phase.",
         stage: controlPlaneState.workflow.current_stage,
       };
    } catch (e: unknown) {
       const err = e as Error & { stderr?: Buffer; stdout?: Buffer; status?: number };
       const stderrStr = err.stderr ? err.stderr.toString("utf8") : "";
       return {
         status: "WARN",
         reason: `Command failed with exit code ${err.status ?? 1}.\n${err.message}\nStderr:\n${stderrStr}`,
         evidence_checked: ["bash_security"],
         next_step: "Command failed. Consider revising your shell command.",
         stage: controlPlaneState.workflow.current_stage,
       };
    }
  }

  throw new Error(`Unsupported guard command '${command}'.`);
}
