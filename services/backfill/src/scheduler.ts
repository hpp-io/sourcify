import cron from "node-cron";
import { BackfillRunner } from "./backfill-runner.js";
import type { SchedulerConfig } from "./types.js";

export class BackfillScheduler {
  private config: SchedulerConfig;
  private isRunning = false;

  constructor(config: SchedulerConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    const mode = this.config.mode || "periodic";

    if (mode === "oneshot") {
      console.log("[scheduler] Running in oneshot mode");
      await this.runAllChains();
      console.log("[scheduler] Oneshot completed");
      return;
    }

    // Periodic mode
    const schedule = this.config.cronSchedule || "0 */6 * * *"; // Default: every 6 hours
    console.log(`[scheduler] Starting periodic mode with schedule: ${schedule}`);

    cron.schedule(schedule, async () => {
      if (this.isRunning) {
        console.log("[scheduler] Previous run still in progress, skipping this cycle");
        return;
      }

      console.log(`[scheduler] Starting scheduled run at ${new Date().toISOString()}`);
      this.isRunning = true;
      try {
        await this.runAllChains();
      } catch (error) {
        console.error("[scheduler] Error during scheduled run:", error);
      } finally {
        this.isRunning = false;
      }
    });

    console.log("[scheduler] Scheduler started, waiting for cron triggers...");

    // Run immediately on startup
    console.log("[scheduler] Running initial backfill on startup");
    this.isRunning = true;
    try {
      await this.runAllChains();
    } catch (error) {
      console.error("[scheduler] Error during initial run:", error);
    } finally {
      this.isRunning = false;
    }
  }

  private async runAllChains(): Promise<void> {
    console.log(`[scheduler] Processing ${this.config.chains.length} chain(s)`);

    for (const chainConfig of this.config.chains) {
      try {
        console.log(`[scheduler] Starting backfill for chain ${chainConfig.chainId}`);
        const runner = new BackfillRunner(chainConfig);
        await runner.run();
        console.log(`[scheduler] Completed backfill for chain ${chainConfig.chainId}`);
      } catch (error) {
        console.error(`[scheduler] Error processing chain ${chainConfig.chainId}:`, error);
      }
    }

    console.log("[scheduler] All chains processed");
  }
}
