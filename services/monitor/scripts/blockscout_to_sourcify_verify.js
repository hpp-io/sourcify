// scripts/blockscout-to-sourcify-verify.js
// 실행: node scripts/blockscout-to-sourcify-verify.js

const CHAIN_ID = 181228;
const ADDRESS = "0x14a9BB30D25CA21E1084C1e676Af190BC9157546";
const BLOCKSCOUT_API = "https://sepolia-explorer.hpp.io/api";
const SOURCIFY_SERVER = "http://localhost:5555";

async function httpJson(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}: ${text}`);
  return JSON.parse(text);
}

async function getBlockscoutSource(address) {
  const url = new URL(BLOCKSCOUT_API);
  url.searchParams.set("module", "contract");
  url.searchParams.set("action", "getsourcecode");
  url.searchParams.set("address", address);

  const json = await httpJson(url);
  if (json.status !== "1" || !json.result?.length) {
    throw new Error(`getsourcecode failed: ${JSON.stringify(json)}`);
  }
  return json.result[0];
}

/**
 * Blockscout 인스턴스마다 creation tx 조회가 다릅니다.
 * 아래는 흔한 후보들을 “시도”합니다.
 */
async function tryGetCreationTxHash(address) {
  const candidates = [
    // (1) Blockscout/Etherscan 호환으로 종종 존재
    () => {
      const url = new URL(BLOCKSCOUT_API);
      url.searchParams.set("module", "contract");
      url.searchParams.set("action", "getcontractcreation");
      url.searchParams.set("contractaddresses", address);
      return httpJson(url);
    },
    // (2) 일부는 action명이 다름
    () => {
      const url = new URL(BLOCKSCOUT_API);
      url.searchParams.set("module", "contract");
      url.searchParams.set("action", "getContractCreation");
      url.searchParams.set("contractaddresses", address);
      return httpJson(url);
    },
    // (3) v2가 켜져 있으면 이렇게 제공되는 경우도 있음 (없으면 실패)
    () => httpJson(`https://sepolia-explorer.hpp.io/api/v2/addresses/${address}`),
  ];

  for (const fn of candidates) {
    try {
      const json = await fn();

      // 케이스 A: getcontractcreation 형태
      if (json?.status === "1" && Array.isArray(json?.result) && json.result[0]) {
        const r0 = json.result[0];
        return (
          r0.creation_tx_hash ||
          r0.creation_transaction_hash ||
          r0.txHash ||
          r0.transactionHash ||
          null
        );
      }

      // 케이스 B: v2 address 형태 (키는 인스턴스별 상이)
      if (json?.creation_tx_hash || json?.creation_transaction_hash) {
        return json.creation_tx_hash || json.creation_transaction_hash;
      }
    } catch {
      // ignore, try next
    }
  }

  return null;
}

function buildStandardJsonPayload(blockscoutResult, creationTransactionHash) {
  const fileName = blockscoutResult.FileName || "Contract.sol";
  const contractName = blockscoutResult.ContractName;
  if (!contractName) throw new Error("Missing ContractName from blockscout result");
  if (!blockscoutResult.SourceCode) throw new Error("Missing SourceCode from blockscout result");
  if (!blockscoutResult.CompilerVersion) throw new Error("Missing CompilerVersion from blockscout result");

  const compilerVersion = String(blockscoutResult.CompilerVersion).replace(/^v/, "");

  // Blockscout가 준 CompilerSettings를 settings로 사용
  const settings = blockscoutResult.CompilerSettings || {};

  return {
    stdJsonInput: {
      language: "Solidity",
      sources: {
        [fileName]: { content: blockscoutResult.SourceCode },
      },
      settings,
    },
    compilerVersion,
    contractIdentifier: `${fileName}:${contractName}`,
    ...(creationTransactionHash ? { creationTransactionHash } : {}),
  };
}

async function postToSourcify(chainId, address, payload) {
  const url = `${SOURCIFY_SERVER}/v2/verify/${chainId}/${address}`;
  return httpJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

(async () => {
  const src = await getBlockscoutSource(ADDRESS);
  const creationTx = await tryGetCreationTxHash(ADDRESS);

  console.log("Blockscout source fetched:", {
    address: src.Address,
    contractName: src.ContractName,
    fileName: src.FileName,
    compilerVersion: src.CompilerVersion,
    hasCompilerSettings: !!src.CompilerSettings,
    creationTx,
  });

  const payload = buildStandardJsonPayload(src, creationTx);

  const result = await postToSourcify(CHAIN_ID, ADDRESS, payload);
  console.log("Sourcify verify result:", result);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
