/**
 * Backfill verified contracts from Blockscout into local Sourcify, by scanning blocks.
 *
 * Requirements:
 *  - Node 18+ (fetch available)
 *  - Optional: .env with API_KEY=...
 *
 * Usage example:
 * node services/monitor/scripts/blockscout_sourcify_backfill.js \
 *  --chain-id 181228 \
 *  --rpc-url "https://sepolia.hpp.io/{API_KEY}" \
 *  --blockscout-api "https://sepolia-explorer.hpp.io/api" \
 *  --sourcify-url "http://localhost:5555" \
 *  --from 0 --to latest --concurrency 3
 *
 * Or using environment variables:
 * CHAIN_ID=181228 \
 * RPC_URL="https://sepolia.hpp.io/{API_KEY}" \
 * BLOCKSCOUT_API="https://sepolia-explorer.hpp.io/api" \
 * SOURCIFY_URL="http://localhost:5555" \
 * node services/monitor/scripts/blockscout_sourcify_backfill.js --from 0 --to latest
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    // Convert kebab-case to camelCase
    const key = a
      .slice(2)
      .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
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

function loadDotEnvIfExists() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    v = v.replace(/^"(.+)"$/, "$1").replace(/^'(.+)'$/, "$1");
    if (!(k in process.env)) process.env[k] = v;
  }
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}: ${text}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON from ${url}: ${text.slice(0, 300)}`);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeAddress(addr) {
  return String(addr).toLowerCase();
}

// Minimal JSON-RPC client (no ethers dependency)
async function rpcCall(rpcUrl, method, params) {
  const payload = {
    jsonrpc: "2.0",
    id: Math.floor(Math.random() * 1e9),
    method,
    params,
  };
  const json = await fetchJson(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (json.error) {
    throw new Error(`RPC error ${method}: ${JSON.stringify(json.error)}`);
  }
  return json.result;
}

function toHexQty(n) {
  const bi = BigInt(n);
  return "0x" + bi.toString(16);
}

async function getLatestBlockNumber(rpcUrl) {
  const hex = await rpcCall(rpcUrl, "eth_blockNumber", []);
  return Number(BigInt(hex));
}

async function getBlockWithTxs(rpcUrl, blockNumber) {
  return rpcCall(rpcUrl, "eth_getBlockByNumber", [toHexQty(blockNumber), true]);
}

async function getReceipt(rpcUrl, txHash) {
  return rpcCall(rpcUrl, "eth_getTransactionReceipt", [txHash]);
}

async function getBlockscoutSource(blockscoutApi, address) {
  const url = new URL(blockscoutApi);
  url.searchParams.set("module", "contract");
  url.searchParams.set("action", "getsourcecode");
  url.searchParams.set("address", address);

  const json = await fetchJson(url.toString());
  if (json.status !== "1" || !json.result?.length) return null;
  const r0 = json.result[0];
  if (!r0?.SourceCode) return null;
  return r0;
}

// Best-effort creation tx hash fetch (optional)
async function tryGetCreationTxHash(blockscoutApi, address) {
  const url = new URL(blockscoutApi);
  url.searchParams.set("module", "contract");
  url.searchParams.set("action", "getcontractcreation");
  url.searchParams.set("contractaddresses", address);

  try {
    const json = await fetchJson(url.toString());
    if (json.status !== "1" || !json.result?.length) return null;
    const r0 = json.result[0] || {};
    return r0.creation_tx_hash || r0.creation_transaction_hash || null;
  } catch {
    return null;
  }
}

function buildVerifyPayload(blockscoutResult, creationTxHash) {
  const contractName = blockscoutResult.ContractName;
  const compilerVersion = String(blockscoutResult.CompilerVersion || "").replace(
    /^v/,
    "",
  );

  let sources = {};
  let settings = {};
  let fileName = blockscoutResult.FileName || "Contract.sol";
  const sourceCode = blockscoutResult.SourceCode;

  // Detect multi-file contract by checking if SourceCode is JSON
  if (sourceCode && (sourceCode.trim().startsWith("{") || sourceCode.trim().startsWith("[{"))) {
    try {
      const parsed = JSON.parse(sourceCode.startsWith("[{") ? sourceCode.slice(1, -1) : sourceCode);

      // Standard JSON input format
      if (parsed.language && parsed.sources) {
        sources = parsed.sources;
        settings = parsed.settings || {};
        // Find the file containing the contract
        for (const [file, content] of Object.entries(sources)) {
          if (content.content && content.content.includes(`contract ${contractName}`)) {
            fileName = file;
            break;
          }
        }
      }
      // Simple multi-file format: { "Contract.sol": { content: "..." }, ... }
      else if (typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [file, content] of Object.entries(parsed)) {
          if (typeof content === "object" && content.content) {
            sources[file] = { content: content.content };
          } else if (typeof content === "string") {
            sources[file] = { content };
          }
        }
        settings = blockscoutResult.CompilerSettings || {};
        // Find the file containing the contract
        for (const [file, fileData] of Object.entries(sources)) {
          if (fileData.content && fileData.content.includes(`contract ${contractName}`)) {
            fileName = file;
            break;
          }
        }
      }
    } catch (e) {
      // If parsing fails, treat as single file
      sources = { [fileName]: { content: sourceCode } };
      settings = blockscoutResult.CompilerSettings || {};
    }
  } else {
    // Single file contract
    sources = { [fileName]: { content: sourceCode } };
    settings = blockscoutResult.CompilerSettings || {};
  }

  const payload = {
    stdJsonInput: {
      language: "Solidity",
      sources,
      settings,
    },
    compilerVersion,
    contractIdentifier: `${fileName}:${contractName}`,
  };

  if (creationTxHash) payload.creationTransactionHash = creationTxHash;
  return payload;
}

async function verifyToSourcify(sourcifyBase, chainId, address, payload) {
  const url = `${sourcifyBase.replace(/\/+$/, "")}/v2/verify/${chainId}/${address}`;
  return fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "hpp-backfill" },
    body: JSON.stringify(payload),
  });
}

function createLimiter(concurrency) {
  let active = 0;
  const queue = [];
  const runNext = () => {
    if (active >= concurrency) return;
    const job = queue.shift();
    if (!job) return;
    active++;
    job()
      .catch(() => {})
      .finally(() => {
        active--;
        runNext();
      });
  };
  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push(async () => {
        try {
          resolve(await fn());
        } catch (e) {
          reject(e);
        }
      });
      runNext();
    });
}

function loadState(statePath) {
  if (!fs.existsSync(statePath)) {
    return {
      lastScannedBlock: -1,
      seenContracts: {},
      verifiedContracts: {},
      failedContracts: {},
    };
  }
  return JSON.parse(fs.readFileSync(statePath, "utf8"));
}

function saveState(statePath, state) {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

async function main() {
  loadDotEnvIfExists();

  const args = parseArgs(process.argv);

  // Support both CLI args and environment variables
  const chainId = Number(args.chainId || process.env.CHAIN_ID);
  const rpcUrlTemplate = String(args.rpcUrl || process.env.RPC_URL || "");
  const blockscoutApi = String(args.blockscoutApi || process.env.BLOCKSCOUT_API || "");
  const sourcifyBase = String(args.sourcifyUrl || process.env.SOURCIFY_URL || "http://localhost:5555");
  const fromBlock = Number(args.from ?? 0);
  const toArg = String(args.to ?? "latest");
  const concurrency = Number(args.concurrency ?? 3);

  if (!chainId || !rpcUrlTemplate || !blockscoutApi) {
    throw new Error(
      "Missing required args: --chain-id (or CHAIN_ID), --rpc-url (or RPC_URL), --blockscout-api (or BLOCKSCOUT_API)",
    );
  }

  const apiKey = process.env.API_KEY || "";

  // Only require API key if template contains {API_KEY}
  if (rpcUrlTemplate.includes("{API_KEY}") && !apiKey) {
    throw new Error(
      "Missing RPC api key env var: API_KEY. Put it in .env or export it.",
    );
  }

  const rpcUrl = rpcUrlTemplate.replace("{API_KEY}", apiKey);

  const latest = await getLatestBlockNumber(rpcUrl);
  const toBlock = toArg === "latest" ? latest : Number(toArg);

  const statePath = path.resolve(
    process.cwd(),
    `.backfill-state-${chainId}.json`,
  );
  const state = loadState(statePath);

  const start = Math.max(fromBlock, state.lastScannedBlock + 1);
  console.log("[backfill] start", {
    chainId,
    rpcUrlMasked: rpcUrl.replace(apiKey, apiKey.slice(0, 4) + "****"),
    blockscoutApi,
    sourcifyBase,
    start,
    toBlock,
    concurrency,
    statePath,
  });

  const limit = createLimiter(concurrency);

  for (let bn = start; bn <= toBlock; bn++) {
    const block = await getBlockWithTxs(rpcUrl, bn);

    const txs = Array.isArray(block?.transactions) ? block.transactions : [];
    for (const tx of txs) {
      // contract creation tx: "to" is null
      if (tx?.to !== null) continue;

      const txHash = tx?.hash;
      if (!txHash) continue;

      const receipt = await getReceipt(rpcUrl, txHash);
      const contractAddress = receipt?.contractAddress;
      if (!contractAddress) continue;

      const addr = normalizeAddress(contractAddress);
      if (state.seenContracts[addr]) continue;
      state.seenContracts[addr] = { blockNumber: bn, txHash };

      // process contract address async-limited
      limit(async () => {
        try {
          const src = await getBlockscoutSource(blockscoutApi, addr);
          if (!src) {
            state.failedContracts[addr] = {
              reason: "not_verified_on_blockscout_or_no_source",
            };
            return;
          }

          const creationTxHash = await tryGetCreationTxHash(blockscoutApi, addr);
          const payload = buildVerifyPayload(src, creationTxHash);

          const res = await verifyToSourcify(sourcifyBase, chainId, addr, payload);
          state.verifiedContracts[addr] = { ok: true, response: res };
          delete state.failedContracts[addr];
        } catch (e) {
          state.failedContracts[addr] = { reason: String(e?.message || e) };
        } finally {
          // occasionally persist progress
          if (Object.keys(state.seenContracts).length % 10 === 0) {
            saveState(statePath, state);
          }
        }
      }).catch(() => {});
    }

    state.lastScannedBlock = bn;
    if (bn % 50 === 0) {
      saveState(statePath, state);
      console.log("[backfill] progress", {
        bn,
        verified: Object.keys(state.verifiedContracts).length,
        seen: Object.keys(state.seenContracts).length,
        failed: Object.keys(state.failedContracts).length,
      });
    }

    // 아주 작은 sleep (옵션) — 필요하면 주석 해제
    // await sleep(10);
  }

  // wait for outstanding limited tasks: crude drain
  // (queue가 비면 active가 0이 될 때까지 대기)
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    await sleep(500);
    // limiter 내부 상태를 노출하지 않으니, 보수적으로 조금 더 기다리는 방식
    // 컨트랙트 수가 적으니 이 정도로 충분
    if (Object.keys(state.seenContracts).length === Object.keys(state.verifiedContracts).length + Object.keys(state.failedContracts).length) {
      break;
    }
  }

  saveState(statePath, state);
  console.log("[backfill] done", {
    lastScannedBlock: state.lastScannedBlock,
    verified: Object.keys(state.verifiedContracts).length,
    seen: Object.keys(state.seenContracts).length,
    failed: Object.keys(state.failedContracts).length,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
