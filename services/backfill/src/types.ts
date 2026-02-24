export interface BackfillConfig {
  chainId: number;
  rpcUrl: string;
  blockscoutApi: string;
  sourcify: string;
  fromBlock?: number;
  toBlock?: number | "latest";
  concurrency?: number;
  statePath?: string;
}

export interface BackfillState {
  lastScannedBlock: number;
  seenContracts: Record<string, ContractSeen>;
  verifiedContracts: Record<string, ContractVerified>;
  failedContracts: Record<string, ContractFailed>;
}

export interface ContractSeen {
  blockNumber: number;
  txHash: string;
}

export interface ContractVerified {
  ok: boolean;
  response: unknown;
}

export interface ContractFailed {
  reason: string;
}

export interface BlockscoutSourceResult {
  SourceCode: string;
  FileName?: string;
  ContractName: string;
  CompilerVersion?: string;
  CompilerSettings?: Record<string, unknown>;
  AdditionalSources?: Array<{ Filename: string; SourceCode: string }>;
}

export interface VerifyPayload {
  stdJsonInput: {
    language: string;
    sources: Record<string, { content: string }>;
    settings: Record<string, unknown>;
  };
  compilerVersion: string;
  contractIdentifier: string;
  creationTransactionHash?: string;
}

export interface SchedulerConfig {
  chains: BackfillConfig[];
  cronSchedule?: string;
  mode?: "oneshot" | "periodic";
}
