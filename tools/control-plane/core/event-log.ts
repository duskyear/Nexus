import { mkdir, appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";

export type EventLogEntry =
  | {
      type: "stage_entered";
      stage: string;
      status: "PASS" | "WARN" | "BLOCK";
      reason: string;
      recorded_at: string;
    }
  | {
      type: "review_passed" | "review_blocked";
      gate: "review1" | "review2" | "review3";
      status: "PASS" | "WARN" | "BLOCK";
      reason: string;
      recorded_at: string;
    }
  | {
      type: "claim_verified" | "claim_blocked";
      claim: string;
      status: "PASS" | "WARN" | "BLOCK";
      reason: string;
      recorded_at: string;
    }
  | {
      type: "cap_warning" | "cap_exceeded";
      status: "PASS" | "WARN" | "BLOCK";
      reason: string;
      recorded_at: string;
    };

const EVENT_LOG_PATH = join(".harness", "event-log.jsonl");

export async function appendEventLog(cwd: string, entry: EventLogEntry): Promise<void> {
  await mkdir(join(cwd, ".harness"), { recursive: true });
  await appendFile(join(cwd, EVENT_LOG_PATH), `${JSON.stringify(entry)}\n`, "utf8");
}

export async function readEventLog(cwd: string): Promise<EventLogEntry[]> {
  try {
    const raw = await readFile(join(cwd, EVENT_LOG_PATH), "utf8");
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as EventLogEntry);
  } catch {
    return [];
  }
}
