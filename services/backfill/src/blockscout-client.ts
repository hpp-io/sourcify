import { fetchJson, formatTimestamp } from "./utils.js";
import type { BlockscoutSourceResult, VerifyPayload } from "./types.js";

interface BlockscoutApiResponse {
  status: string;
  result?: BlockscoutSourceResult[];
}

interface BlockscoutCreationResponse {
  status: string;
  result?: Array<{
    creation_tx_hash?: string;
    creation_transaction_hash?: string;
  }>;
}

export async function getBlockscoutSource(
  blockscoutApi: string,
  address: string
): Promise<BlockscoutSourceResult | null> {
  const url = new URL(blockscoutApi);
  url.searchParams.set("module", "contract");
  url.searchParams.set("action", "getsourcecode");
  url.searchParams.set("address", address);

  const json = (await fetchJson(url.toString())) as BlockscoutApiResponse;
  if (json.status !== "1" || !json.result?.length) {
    console.info(`[${formatTimestamp()}] contract ${address}: not_verified`);
    return null;
  }

  const r0 = json.result[0];
  if (!r0?.SourceCode) {
    console.info(`[${formatTimestamp()}] contract ${address}: no_source`);
    return null;
  }

  return r0;
}

export async function tryGetCreationTxHash(
  blockscoutApi: string,
  address: string
): Promise<string | null> {
  const url = new URL(blockscoutApi);
  url.searchParams.set("module", "contract");
  url.searchParams.set("action", "getcontractcreation");
  url.searchParams.set("contractaddresses", address);

  try {
    const json = (await fetchJson(url.toString())) as BlockscoutCreationResponse;
    if (json.status !== "1" || !json.result?.length) return null;
    const r0 = json.result[0] || {};
    return r0.creation_tx_hash || r0.creation_transaction_hash || null;
  } catch {
    return null;
  }
}

export function buildVerifyPayload(
  blockscoutResult: BlockscoutSourceResult,
  creationTxHash: string | null
): VerifyPayload {
  const contractName = blockscoutResult.ContractName;
  const compilerVersion = String(blockscoutResult.CompilerVersion || "").replace(/^v/, "");

  let sources: Record<string, { content: string }> = {};
  let settings: Record<string, unknown> = {};
  let fileName = blockscoutResult.FileName || "Contract.sol";
  const sourceCode = blockscoutResult.SourceCode;
  const additionalSources = blockscoutResult.AdditionalSources || [];

  // Detect multi-file contract by checking if SourceCode is JSON
  if (sourceCode && (sourceCode.trim().startsWith("{") || sourceCode.trim().startsWith("[{"))) {
    try {
      const parsed = JSON.parse(
        sourceCode.startsWith("[{") ? sourceCode.slice(1, -1) : sourceCode
      );

      // Standard JSON input format
      if (parsed.language && parsed.sources) {
        sources = parsed.sources;
        settings = parsed.settings || {};
        // Find the file containing the contract
        for (const [file, content] of Object.entries(sources)) {
          const contentObj = content as { content: string };
          if (contentObj.content && contentObj.content.includes(`contract ${contractName}`)) {
            fileName = file;
            break;
          }
        }
      }
      // Simple multi-file format: { "Contract.sol": { content: "..." }, ... }
      else if (typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [file, content] of Object.entries(parsed)) {
          if (typeof content === "object" && content !== null && "content" in content) {
            sources[file] = { content: (content as { content: string }).content };
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
    } catch {
      // If parsing fails, treat as single file
      sources = { [fileName]: { content: sourceCode } };
      settings = blockscoutResult.CompilerSettings || {};
    }
  } else {
    // Single file contract or Foundry/Hardhat style with AdditionalSources
    sources = { [fileName]: { content: sourceCode } };
    settings = blockscoutResult.CompilerSettings || {};
  }

  // Add AdditionalSources (Foundry/Hardhat style verification)
  if (additionalSources.length > 0) {
    for (const src of additionalSources) {
      if (src.Filename && src.SourceCode) {
        sources[src.Filename] = { content: src.SourceCode };
      }
    }
  }

  const payload: VerifyPayload = {
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
