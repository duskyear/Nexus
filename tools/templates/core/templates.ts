import type { HarnessState } from "../../guard/schema/state.js";
import { assessOpenSpec } from "../../control-plane/core/openspec.js";
import type { TemplateResult } from "./types.js";

const stageTemplates = {
  plan: `Do not implement yet.

Please turn this request into an executable plan with:
- objective
- scope
- non-scope
- acceptance criteria
- task breakdown
- risks / open questions
- relevant files
- validation method

Also decide:
- execution mode: single-agent / role-based single-agent / multi-agent
- whether AGENT_DESIGN_CARD is required

If the task is not yet concrete enough to implement safely, make that explicit instead of guessing.`,
  openspec: `Enter the OpenSpec stage now.

Do not implement yet.
Do not skip design.
Do not turn unresolved decisions into settled facts.`,
  implementation: `Enter the implementation stage now.

Only handle one task or one small batch.
Do not silently expand scope.
Do not do unrelated cleanup or refactor.
If the task is behavior-changing work, default to TDD.
If the task is debugging work, follow systematic-debugging first.
Keep a live task ledger and attach evidence references to completed tasks.

After the batch, report:
1. current task
2. files changed
3. validation run
4. result
5. remaining risks / next step`,
} as const;

const checkTemplates = {
  review1: `Do not implement yet.

Run the first review gate against the current OpenSpec artifacts and plan.
Review:
- objective alignment
- scope / non-scope clarity
- design feasibility
- task order
- acceptance criteria
- unresolved decisions
- execution mode justification

If orchestration is in scope, review whether it is actually justified and whether AGENT_DESIGN_CARD is complete.
End with a clear conclusion: implementable now / blocked until fixes / blocked until confirmation.`,
  review2: `Pause implementation and run the second review gate.

Review:
- goal alignment
- scope control
- design consistency
- blockers and new risks
- whether debugging / TDD flow was skipped

If orchestration is active, also review:
- context pollution
- duplicated work
- role overlap
- cap overruns
- whether execution mode should be downgraded

End with one recommendation:
- continue
- correct course
- stop for confirmation`,
  review3: `Do not implement new work.

Run the final delivery review based on:
- OpenSpec artifacts
- implemented code
- local run or equivalent validation
- fresh verification evidence

Focus on:
- whether the work is actually complete enough to claim
- whether the evidence supports the claim
- what remains risky
- whether the result is deliverable, conditionally deliverable, or not deliverable`,
} as const;

const verifyClaimTemplate = `Do not claim completion yet.

Please:
1. identify the command that proves the current claim
2. run it now
3. read the full output and exit code
4. capture the command, exit code, and result summary as structured evidence
5. state whether the evidence really supports the claim
6. if the command is noisy or failure-prone, prefer the optional auto-retry wrapper so stderr and retry count stay attached to the evidence
7. if a task ledger exists, link the claim back to task ids and evidence refs

Output:
- claim being evaluated
- verification evidence
- fresh verification evidence only, not stale claims
- whether the claim is supported
- actual status if unsupported`;

const adcTemplate = `# AGENT_DESIGN_CARD

## Task Name

- explicit name aligned with the plan or spec

## Why This Does Or Does Not Need Multi-Agent

- explain whether orchestration reduces context pollution, switching cost, or risk

## Execution Mode

- single-agent
- role-based single-agent
- multi-agent

## Topology

- single-agent
- orchestrator-worker
- router-solver
- pipeline
- hierarchical

## Subtask Split

- parallelizable tasks
- non-parallelizable tasks

## Context Strategy

- shared
- selective
- isolated

## Tool Boundary

- lead-only tools
- worker-allowed tools
- forbidden tools

## Budget Caps

- max_subagents
- max_tool_calls
- max_retries
- max_runtime
- max_token_budget

## HITL Checkpoints

- before execution mode upgrade
- before high-risk changes
- when subtask independence collapses
- when budget nears a cap
- before fallback switch

## Fallback Path

- downgrade target
- downgrade trigger

## Stop Conditions

- context pollution appears
- duplicated work appears
- coordination cost exceeds value
- caps are exceeded
- fallback is not viable

## Risks / Open Questions

- unresolved orchestration risks`;

const highRiskConfirmationTemplate = `Pause implementation.

This task now involves at least one high-risk change:
- adding major dependencies
- changing architecture significantly
- changing database schema
- changing public APIs
- unrelated cleanup or refactors

Output only:
1. what high-risk change is involved
2. why it is needed
3. what happens if we do not do it
4. realistic alternatives
5. what requires explicit confirmation`;

const executionModeTemplate = `Decide the execution mode before implementation.

Choose exactly one:
1. single-agent
2. role-based single-agent
3. multi-agent

Explain:
- why this mode fits the task
- why a simpler mode is insufficient, if applicable
- why a more complex mode is unnecessary, if applicable

If multi-agent is chosen, also provide:
- lead responsibility
- worker responsibility
- subagent cap
- tool boundary
- budget caps
- HITL checkpoints
- fallback path
- main risks and controls`;

export function getStageTemplate(stage: keyof typeof stageTemplates): TemplateResult {
  return {
    kind: "stage",
    name: stage,
    content: stageTemplates[stage],
  };
}

export function getCheckTemplate(check: keyof typeof checkTemplates): TemplateResult {
  return {
    kind: "check",
    name: check,
    content: checkTemplates[check],
  };
}

export function getVerifyClaimTemplate(): TemplateResult {
  return {
    kind: "verify-claim",
    name: "verify-claim",
    content: verifyClaimTemplate,
  };
}

export function getAdcTemplate(): TemplateResult {
  return {
    kind: "adc",
    name: "adc",
    content: adcTemplate,
  };
}

export function getHighRiskConfirmationTemplate(): TemplateResult {
  return {
    kind: "high-risk-confirmation",
    name: "high-risk-confirmation",
    content: highRiskConfirmationTemplate,
  };
}

export function getExecutionModeTemplate(): TemplateResult {
  return {
    kind: "execution-mode",
    name: "execution-mode",
    content: executionModeTemplate,
  };
}

function appendSection(base: string, title: string, lines: string[]): string {
  if (lines.length === 0) {
    return base;
  }

  return `${base}\n\n${title}\n${lines.join("\n")}`;
}

function getDefaultSkillRecommendations(template: TemplateResult): string[] {
  if (template.kind === "stage") {
    if (template.name === "plan") {
      return ["brainstorming", "writing-plans", "deep-interview", "ralplan"];
    }

    if (template.name === "openspec") {
      return ["writing-plans", "verification-before-completion"];
    }

    if (template.name === "implementation") {
      return [
        "using-git-worktrees",
        "executing-plans",
        "test-driven-development",
        "subagent-driven-development",
        "requesting-code-review",
        "receiving-code-review",
        "systematic-debugging",
      ];
    }
  }

  if (template.kind === "check") {
    if (template.name === "review1") {
      return ["verification-before-completion", "brainstorming"];
    }

    if (template.name === "review2") {
      return ["requesting-code-review", "receiving-code-review", "systematic-debugging"];
    }

    if (template.name === "review3") {
      return ["verification-before-completion", "finishing-a-development-branch"];
    }
  }

  if (template.kind === "verify-claim") {
    return ["verification-before-completion"];
  }

  return [];
}

function applySkillRecommendations(
  template: TemplateResult,
  skills: string[] | undefined,
): TemplateResult {
  const recommendedSkills = skills && skills.length > 0 ? skills : getDefaultSkillRecommendations(template);
  if (recommendedSkills.length === 0) {
    return template;
  }

  return {
    ...template,
    content: appendSection(template.content, "Recommended skills", recommendedSkills.map((skill) => `- ${skill}`)),
    meta: {
      ...template.meta,
      recommendedSkills,
    },
  };
}

function buildOpenSpecBody(artifactLevel: "minimal" | "standard" | "full"): string {
  const intro = stageTemplates.openspec;

  if (artifactLevel === "minimal") {
    return `${intro}

Based on the approved plan, produce the minimum necessary spec artifacts:
- spec-note
- implementation approach
- task list
- validation notes

Keep it lightweight.
Only capture the decisions needed to enter Review Gate 1 safely.`;
  }

  if (artifactLevel === "standard") {
    return `${intro}

Based on the approved plan, produce a reviewable standard artifact set:
- proposal.md
- design.md
- tasks.md
- validation approach

Use the smallest complete set that keeps scope, design, and execution clear.`;
  }

  return `${intro}

Based on the approved plan, produce the fuller artifact set:
- proposal.md
- specs/
- design.md
- tasks.md
- validation approach

Capture interfaces, design rationale, and task sequencing explicitly before implementation.`;
}

export function enrichStageTemplate(template: TemplateResult, state: HarnessState | null): TemplateResult {
  if (template.name !== "openspec") {
    return template;
  }

  const complexity = template.meta?.complexity === "high" || template.meta?.complexity === "medium"
    ? template.meta.complexity
    : "low";
  const fileCount = typeof template.meta?.fileCount === "number" ? template.meta.fileCount : 1;
  const taskCount = typeof template.meta?.taskCount === "number" ? template.meta.taskCount : 1;
  const behaviorChange = Boolean(template.meta?.behaviorChange);
  const openspecDecision = assessOpenSpec({
    complexity,
    fileCount,
    taskCount,
    behaviorChange,
  });

  const lines = [
    `- artifact level: ${openspecDecision.artifact_level}`,
    `- required artifacts: ${openspecDecision.required_artifacts.join(", ")}`,
    `- external skill recommended: ${openspecDecision.external_skill_recommended}`,
    `- guidance: ${openspecDecision.external_skill_recommended ? "A fuller artifact set is recommended; external OpenSpec skill remains optional." : "A lightweight spec artifact is sufficient."}`,
  ];

  if (state) {
    lines.unshift(
      `- current_stage: ${state.current_stage}`,
      `- execution_mode: ${state.execution_mode}`,
      `- approved_plan: ${state.approved_plan}`,
      `- openspec_ready: ${state.openspec_ready}`,
    );
  }

  return {
    ...template,
    content: appendSection(
      buildOpenSpecBody(openspecDecision.artifact_level),
      "Current guard context",
      lines,
    ),
  };
}

export function enrichCheckTemplate(template: TemplateResult, state: HarnessState | null): TemplateResult {
  if (!state || template.name !== "review3" || !state.last_verification_claim) {
    return template;
  }

  return {
    ...template,
    content: appendSection(template.content, "Known verification context", [
      `- Last verification claim: ${state.last_verification_claim}`,
      ...state.last_verification_evidence.map((item) => `- Evidence: ${item.command} (exit ${item.exit_code}) -> ${item.summary}`),
    ]),
  };
}

export function enrichVerifyClaimTemplate(template: TemplateResult, state: HarnessState | null): TemplateResult {
  if (!state || !state.last_verification_claim) {
    return template;
  }

  return {
    ...template,
    content: appendSection(template.content, "Known verification context", [
      `- Last verification claim: ${state.last_verification_claim}`,
      ...state.last_verification_evidence.map((item) => `- Recent evidence: ${item.command} (exit ${item.exit_code}) -> ${item.summary}`),
    ]),
  };
}

export function withSkillRecommendations(
  template: TemplateResult,
  skills: string[] | undefined,
): TemplateResult {
  return applySkillRecommendations(template, skills);
}
