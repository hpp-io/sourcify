#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { loadDotEnvIfExists } from "./utils.js";
import { loadConfig } from "./config-loader.js";
import { BackfillScheduler } from "./scheduler.js";

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

async function main() {
  // Load .env file if exists
  const envPath = path.resolve(process.cwd(), ".env");
  loadDotEnvIfExists(envPath);

  const args = parseArgs(process.argv);

  const configPath = String(args.config || "backfill-config.json");
  const mode = String(args.mode || "periodic") as "oneshot" | "periodic";

  console.log("[backfill] Starting with config:", configPath);
  console.log("[backfill] Mode:", mode);

  const config = loadConfig(configPath);
  config.mode = mode;

  const scheduler = new BackfillScheduler(config);
  await scheduler.start();

  // Keep the process running in periodic mode
  if (mode === "periodic") {
    console.log("[backfill] Service running. Press Ctrl+C to stop.");
    await new Promise(() => {}); // Run forever
  }
}

main().catch((error) => {
  console.error("[backfill] Fatal error:", error);
  process.exit(1);
});
