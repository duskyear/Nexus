import { loadConfig, loadState } from "../../guard/state/store.js";
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
} from "../core/templates.js";
import type { TemplateResult } from "../core/types.js";

export interface RunTemplateOptions {
  cwd: string;
}

export async function runTemplate(argv: string[], options: RunTemplateOptions): Promise<TemplateResult> {
  const config = await loadConfig(options.cwd);
  const state = await loadState(options.cwd);

  const [command, subcommand] = argv;
  if (!command) {
    throw new Error("Template command is required: stage, check, verify-claim, adc, high-risk-confirmation, or execution-mode.");
  }

  if (command === "stage") {
    if (subcommand !== "plan" && subcommand !== "openspec" && subcommand !== "implementation") {
      throw new Error("Stage template requires a subcommand: plan, openspec, or implementation.");
    }

    const complexity = readFlag(argv, "--complexity");
    const fileCount = Number.parseInt(readFlag(argv, "--file-count") ?? "1", 10);
    const taskCount = Number.parseInt(readFlag(argv, "--task-count") ?? "1", 10);
    const behaviorChange = argv.includes("--behavior-change");
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
      throw new Error("Check template requires a subcommand: review1, review2, or review3.");
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

  throw new Error(
    `Unsupported template command '${command}'. Expected one of: stage, check, verify-claim, adc, high-risk-confirmation, execution-mode.`,
  );
}

function readFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  return args[index + 1];
}
