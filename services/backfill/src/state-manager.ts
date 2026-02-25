import fs from "node:fs";
import path from "node:path";
import type { BackfillState } from "./types.js";

export function loadState(statePath: string): BackfillState {
  if (!fs.existsSync(statePath)) {
    return {
      lastScannedBlock: -1,
      seenContracts: {},
      verifiedContracts: {},
      failedContracts: {},
    };
  }
  return JSON.parse(fs.readFileSync(statePath, "utf8")) as BackfillState;
}

export function saveState(statePath: string, state: BackfillState): void {
  // Ensure directory exists
  const dir = path.dirname(statePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}
