import fs from "node:fs";
import path from "node:path";
import type { SchedulerConfig } from "./types.js";

export function loadConfig(configPath: string): SchedulerConfig {
  const fullPath = path.resolve(process.cwd(), configPath);

  if (!fs.existsSync(fullPath)) {
    throw new Error(`Config file not found: ${fullPath}`);
  }

  const content = fs.readFileSync(fullPath, "utf8");
  const config = JSON.parse(content) as SchedulerConfig;

  // Validate config
  if (!config.chains || !Array.isArray(config.chains) || config.chains.length === 0) {
    throw new Error("Config must contain a 'chains' array with at least one chain");
  }

  for (const chain of config.chains) {
    if (!chain.chainId) throw new Error("Each chain must have a 'chainId'");
    if (!chain.rpcUrl) throw new Error("Each chain must have a 'rpcUrl'");
    if (!chain.blockscoutApi) throw new Error("Each chain must have a 'blockscoutApi'");
    if (!chain.sourcify) throw new Error("Each chain must have a 'sourcify'");
  }

  return config;
}
