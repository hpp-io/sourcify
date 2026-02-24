# Sourcify Backfill Service

Automated service to backfill verified contracts from Blockscout into Sourcify by scanning blocks and detecting contract deployments.

## Features

- 🔄 **Periodic Scheduling**: Runs backfill automatically on a configurable schedule (default: every 6 hours)
- 🎯 **One-shot Mode**: Run backfill once and exit
- 📊 **Multi-chain Support**: Process multiple chains in a single configuration
- 💾 **State Persistence**: Saves progress to resume from last scanned block
- ⚡ **Concurrent Processing**: Configurable concurrency for efficient processing
- 🔒 **Independent Package**: No dependencies on monitor service

## Installation

```bash
cd services/backfill
npm install
npm run build
```

## Configuration

### 1. Create Config File

Copy the example config and customize:

```bash
cp backfill-config.example.json backfill-config.json
```

Example configuration:

```json
{
  "cronSchedule": "0 */6 * * *",
  "chains": [
    {
      "chainId": 181228,
      "rpcUrl": "https://sepolia.hpp.io/{API_KEY}",
      "blockscoutApi": "https://sepolia-explorer.hpp.io/api",
      "sourcify": "http://localhost:5555",
      "fromBlock": 0,
      "toBlock": "latest",
      "concurrency": 3
    }
  ]
}
```

### 2. Setup Environment Variables

```bash
cp .env.example .env
# Edit .env and add your API keys
```

## Usage

### Periodic Mode (Default)

Runs continuously with scheduled backfills:

```bash
npm start
```

Or with custom config:

```bash
node dist/index.js --config my-config.json
```

### One-shot Mode

Run once and exit:

```bash
npm run dev
```

Or:

```bash
node dist/index.js --mode oneshot --config my-config.json
```

## Configuration Options

### Scheduler Config

- `cronSchedule` (optional): Cron expression for scheduling (default: `"0 */6 * * *"` - every 6 hours)
- `chains`: Array of chain configurations
- `mode`: Set via CLI args: `"oneshot"` or `"periodic"` (default)

### Chain Config

Each chain in the `chains` array supports:

- `chainId` (required): The chain ID
- `rpcUrl` (required): RPC URL with optional `{API_KEY}` placeholder
- `blockscoutApi` (required): Blockscout API endpoint
- `sourcify` (required): Sourcify server URL
- `fromBlock` (optional): Starting block number (default: 0)
- `toBlock` (optional): Ending block number or "latest" (default: "latest")
- `concurrency` (optional): Number of concurrent contract verifications (default: 3)
- `statePath` (optional): Custom path for state file (default: `.backfill-state-{chainId}.json`)

**Note**: The `rpcUrl` field supports `{API_KEY}` placeholder which will be replaced with the `API_KEY` environment variable. If your RPC URL doesn't require an API key, you can provide the full URL directly.

## State Management

The service maintains state files (`.backfill-state-{chainId}.json`) that track:

- Last scanned block
- Seen contracts
- Successfully verified contracts
- Failed contracts with error reasons

This allows the service to resume from where it left off after restarts.

## Cron Schedule Examples

- `"0 */6 * * *"` - Every 6 hours
- `"0 */12 * * *"` - Every 12 hours
- `"0 0 * * *"` - Daily at midnight
- `"0 2 * * *"` - Daily at 2 AM
- `"*/30 * * * *"` - Every 30 minutes

See [cron syntax](https://github.com/node-cron/node-cron#cron-syntax) for more patterns.

## Development

```bash
# Build TypeScript
npm run build

# Lint
npm run check

# Fix linting issues
npm run fix
```

## Architecture

```
src/
├── types.ts              # TypeScript type definitions
├── utils.ts              # Utility functions
├── rpc-client.ts         # JSON-RPC client for blockchain
├── blockscout-client.ts  # Blockscout API client
├── sourcify-client.ts    # Sourcify API client
├── state-manager.ts      # State persistence
├── backfill-runner.ts    # Core backfill logic
├── scheduler.ts          # Cron scheduling
├── config-loader.ts      # Configuration loading
└── index.ts              # Entry point
```

## Migration from Old Script

The old script (`services/monitor/scripts/blockscout_sourcify_backfill.js`) is now deprecated. This new service provides:

- TypeScript for better type safety
- Modular architecture for easier maintenance
- Periodic scheduling built-in
- Multi-chain support in single config
- Better error handling and logging

To migrate, simply create a config file with your chain settings and start the service.
