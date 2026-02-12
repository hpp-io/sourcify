const defaultConfig = {
  decentralizedStorages: {
    ipfs: {
      enabled: true,
      gateways: [
        "https://ipfs.io/ipfs/",
        "https://w3s.link/ipfs/",
        "https://nftstorage.link/ipfs/"
      ],
      timeout: 30000,
      interval: 5000,
      retries: 5,
    },
  },
  sourcifyServerURLs: ["http://localhost:5555/"],
  sourcifyRequestOptions: {
    maxRetries: 3,
    retryDelay: 30000,
  },
  similarityVerification: {
    requestDelay: 15000,
  },
  defaultChainConfig: {
    startBlock: undefined,
    blockInterval: 60000,
    blockIntervalFactor: 1.1,
    blockIntervalUpperLimit: 600000,
    blockIntervalLowerLimit: 25,
    bytecodeInterval: 5000,
    bytecodeNumberOfTries: 5,
    traceInterval: 15000,
    traceNumberOfTries: 5,
    traceDelay: 0,
  },
  chainConfigs: {
    181228: { startBlock: 20000 },
  },
};

export default defaultConfig;
