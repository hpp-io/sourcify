import fs from "node:fs";
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
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}
