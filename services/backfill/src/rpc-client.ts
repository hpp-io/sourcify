import { fetchJson, toHexQty } from "./utils.js";

interface JsonRpcPayload {
  jsonrpc: string;
  id: number;
  method: string;
  params: unknown[];
}

interface JsonRpcResponse {
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

interface Block {
  transactions: Transaction[];
}

interface Transaction {
  hash: string;
  to: string | null;
}

interface TransactionReceipt {
  contractAddress?: string;
}

export async function rpcCall(rpcUrl: string, method: string, params: unknown[]): Promise<unknown> {
  const payload: JsonRpcPayload = {
    jsonrpc: "2.0",
    id: Math.floor(Math.random() * 1e9),
    method,
    params,
  };

  const json = (await fetchJson(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })) as JsonRpcResponse;

  if (json.error) {
    throw new Error(`RPC error ${method}: ${JSON.stringify(json.error)}`);
  }
  return json.result;
}

export async function getLatestBlockNumber(rpcUrl: string): Promise<number> {
  const hex = (await rpcCall(rpcUrl, "eth_blockNumber", [])) as string;
  return Number(BigInt(hex));
}

export async function getBlockWithTxs(rpcUrl: string, blockNumber: number): Promise<Block> {
  return (await rpcCall(rpcUrl, "eth_getBlockByNumber", [toHexQty(blockNumber), true])) as Block;
}

export async function getReceipt(rpcUrl: string, txHash: string): Promise<TransactionReceipt> {
  return (await rpcCall(rpcUrl, "eth_getTransactionReceipt", [txHash])) as TransactionReceipt;
}
