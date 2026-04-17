import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";

import { parseGuardConfig, type GuardConfig } from "../schema/config.js";
import { createInitialState, parseHarnessState, type HarnessState } from "../schema/state.js";
import {
  applyLegacyHarnessState,
  createControlPlaneState,
  loadControlPlaneState,
  saveControlPlaneState,
  toLegacyHarnessState,
} from "../../control-plane/state/store.js";

const CONFIG_PATH = join("harness", "guard.config.json");
const STATE_PATH = ".harness-state.json";

function parseJsonFile(raw: string): unknown {
  const normalized = raw.replace(/^\uFEFF/, "");
  return JSON.parse(normalized);
}

export async function loadConfig(cwd: string): Promise<GuardConfig> {
  try {
    const raw = await readFile(join(cwd, CONFIG_PATH), "utf8");
    return parseGuardConfig(parseJsonFile(raw));
  } catch (error) {
    throw new Error(
      `Failed to load harness config from ${CONFIG_PATH}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function loadState(cwd: string): Promise<HarnessState | null> {
  const controlState = await loadControlPlaneState(cwd);
  const legacy = toLegacyHarnessState(controlState);
  const fullPath = join(cwd, STATE_PATH);

  try {
    await access(fullPath, constants.F_OK);
  } catch {
    return legacy.current_stage === "plan" &&
      !legacy.approved_plan &&
      !legacy.openspec_ready &&
      !legacy.review1_passed &&
      legacy.review2_last_status === "unknown" &&
      !legacy.local_run_confirmed &&
      !legacy.review3_passed &&
      legacy.execution_mode === "single-agent" &&
      !legacy.adc_required &&
      !legacy.adc_completed &&
      legacy.last_verification_claim === null &&
      legacy.last_verification_evidence.length === 0
      ? null
      : legacy;
  }

  const raw = await readFile(fullPath, "utf8");
  return parseHarnessState(parseJsonFile(raw));
}

export async function loadOrCreateState(cwd: string): Promise<HarnessState> {
  const current = await loadState(cwd);
  if (current) {
    return current;
  }

  const initial = createInitialState();
  const controlState = createControlPlaneState(cwd);
  await saveControlPlaneState(cwd, controlState);
  await saveState(cwd, initial);
  return initial;
}

export async function saveState(cwd: string, state: HarnessState): Promise<void> {
  const currentControlState = await loadControlPlaneState(cwd);
  const nextControlState = applyLegacyHarnessState(currentControlState, state);
  await saveControlPlaneState(cwd, nextControlState);
}
