import path from "node:path";
import { getLatestBlockNumber, getBlockWithTxs, getReceipt } from "./rpc-client.js";
import {
  getBlockscoutSource,
  tryGetCreationTxHash,
  buildVerifyPayload,
} from "./blockscout-client.js";
import { verifyToSourcify } from "./sourcify-client.js";
import { loadState, saveState } from "./state-manager.js";
import { normalizeAddress, createLimiter, sleep, formatTimestamp } from "./utils.js";
import type { BackfillConfig, BackfillState } from "./types.js";

export class BackfillRunner {
  private config: BackfillConfig;
  private rpcUrl: string;
  private state: BackfillState;
  private statePath: string;

  constructor(config: BackfillConfig) {
    this.config = config;
    this.rpcUrl = this.buildRpcUrl();
    this.statePath = config.statePath || path.resolve(process.cwd(), "state", `backfill-state-${config.chainId}.json`);
    this.state = loadState(this.statePath);
  }

  private buildRpcUrl(): string {
    const apiKey = process.env.API_KEY || "";
    // Only require API key if template contains {API_KEY}
    if (this.config.rpcUrl.includes("{API_KEY}") && !apiKey) {
      throw new Error(
        "Missing RPC api key env var: API_KEY. Put it in .env or export it."
      );
    }
    return this.config.rpcUrl.replace("{API_KEY}", apiKey);
  }

  private maskRpcUrl(): string {
    const apiKey = process.env["API_KEY"] || "";
    return this.rpcUrl.replace(apiKey, apiKey.slice(0, 4) + "****");
  }

  async run(): Promise<void> {
    const latest = await getLatestBlockNumber(this.rpcUrl);
    const toBlock = this.config.toBlock === "latest" || !this.config.toBlock ? latest : this.config.toBlock;
    const fromBlock = this.config.fromBlock ?? 0;
    const start = Math.max(fromBlock, this.state.lastScannedBlock + 1);
    const concurrency = this.config.concurrency ?? 3;

    console.log(`[${formatTimestamp()}] [backfill] start`, {
      chainId: this.config.chainId,
      rpcUrlMasked: this.maskRpcUrl(),
      blockscoutApi: this.config.blockscoutApi,
      sourcifyBase: this.config.sourcify,
      start,
      toBlock,
      concurrency,
      statePath: this.statePath,
    });

    const limit = createLimiter(concurrency);

    for (let bn = start; bn <= toBlock; bn++) {
      const block = await getBlockWithTxs(this.rpcUrl, bn);

      const txs = Array.isArray(block?.transactions) ? block.transactions : [];
      for (const tx of txs) {
        // contract creation tx: "to" is null
        if (tx?.to !== null) continue;

        const txHash = tx?.hash;
        if (!txHash) continue;

        const receipt = await getReceipt(this.rpcUrl, txHash);
        const contractAddress = receipt?.contractAddress;
        if (!contractAddress) continue;

        const addr = normalizeAddress(contractAddress);
        if (this.state.seenContracts[addr]) continue;
        this.state.seenContracts[addr] = { blockNumber: bn, txHash };

        // process contract address async-limited
        limit(async () => {
          try {
            const src = await getBlockscoutSource(this.config.blockscoutApi, addr);
            if (!src) {
              const reason = "not_verified_on_blockscout_or_no_source";
              this.state.failedContracts[addr] = { reason };
              return;
            }

            const creationTxHash = await tryGetCreationTxHash(this.config.blockscoutApi, addr);
            const payload = buildVerifyPayload(src, creationTxHash);

            const res = await verifyToSourcify(
              this.config.sourcify,
              this.config.chainId,
              addr,
              payload
            );
            this.state.verifiedContracts[addr] = { ok: true, response: res };
            delete this.state.failedContracts[addr];
            console.log(`[${formatTimestamp()}] [backfill] verified ${addr}`);
          } catch (e) {
            const reason = String((e as Error)?.message || e);
            this.state.failedContracts[addr] = { reason };
            console.log(`[${formatTimestamp()}] [backfill] failed ${addr}: ${reason}`);
          } finally {
            // occasionally persist progress
            if (Object.keys(this.state.seenContracts).length % 10 === 0) {
              saveState(this.statePath, this.state);
            }
          }
        }).catch(() => {});
      }

      this.state.lastScannedBlock = bn;
      if (bn % 50 === 0) {
        saveState(this.statePath, this.state);
        console.log(`[${formatTimestamp()}] [backfill] progress`, {
          bn,
          verified: Object.keys(this.state.verifiedContracts).length,
          seen: Object.keys(this.state.seenContracts).length,
          failed: Object.keys(this.state.failedContracts).length,
        });
      }
    }

    // wait for outstanding limited tasks
    while (true) {
      await sleep(500);
      if (
        Object.keys(this.state.seenContracts).length ===
        Object.keys(this.state.verifiedContracts).length +
          Object.keys(this.state.failedContracts).length
      ) {
        break;
      }
    }

    saveState(this.statePath, this.state);
    console.log(`[${formatTimestamp()}] [backfill] done`, {
      lastScannedBlock: this.state.lastScannedBlock,
      verified: Object.keys(this.state.verifiedContracts).length,
      seen: Object.keys(this.state.seenContracts).length,
      failed: Object.keys(this.state.failedContracts).length,
    });
  }
}
