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

function isPristineLegacyState(state: HarnessState): boolean {
  const initial = createInitialState();
  return (
    state.current_stage === initial.current_stage &&
    state.approved_plan === initial.approved_plan &&
    state.openspec_ready === initial.openspec_ready &&
    state.review1_passed === initial.review1_passed &&
    state.review2_last_status === initial.review2_last_status &&
    state.local_run_confirmed === initial.local_run_confirmed &&
    state.review3_passed === initial.review3_passed &&
    state.execution_mode === initial.execution_mode &&
    state.adc_required === initial.adc_required &&
    state.adc_completed === initial.adc_completed &&
    state.last_verification_claim === initial.last_verification_claim &&
    state.last_verification_evidence.length === initial.last_verification_evidence.length &&
    state.active_operator === initial.active_operator &&
    state.operator_lock_reason === initial.operator_lock_reason
  );
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
    return isPristineLegacyState(legacy) ? null : legacy;
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
