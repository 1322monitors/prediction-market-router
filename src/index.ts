#!/usr/bin/env node
import "dotenv/config";
import { ConfigError, loadConfig } from "./config.js";
import { ensureTrackedAccounts } from "./track-accounts.js";
import { RouterClient } from "./websocket-client.js";

const HELP_TEXT = `
prediction-market-router

Watches a 1322 X/Twitter WebSocket feed for your tracked accounts and
forwards any tweet whose text matches a configured keyword/phrase list to an
outbound webhook, as a normalized JSON event.

Usage:
  npm start
  node dist/index.js
  node dist/index.js --help

Required environment variables:
  X_API_KEY            1322 X/Twitter API key (must match WS_TIER's tier)
  WEBHOOK_URL           Outbound webhook URL that receives matched events

Optional environment variables:
  WS_TIER               "normal" or "ultimate" (default: normal)
  KEYWORDS_FILE          Path to the keyword config JSON (default: config/keywords.json)
  TRACK_ACCOUNTS         Comma-separated X usernames to add to your tracked list on startup
  WEBHOOK_TIMEOUT_MS     Outbound webhook request timeout in ms (default: 5000)
  DEDUP_TTL_MS           How long a tweet id is remembered to prevent duplicate fires (default: 600000)
  DEDUP_MAX_ENTRIES      Max tweet ids kept in the dedup cache (default: 5000)

Set these in a .env file (see .env.example) or in the process environment.
Keyword config format: see config/keywords.example.json.

Full API reference: https://1322.io/docs
`;

function printHelp(): void {
  console.log(HELP_TEXT.trim() + "\n");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`Configuration error: ${err.message}`);
      console.error("Run with --help for usage, or see README.md for setup.");
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  console.log(
    `[config] loaded ${config.keywordConfig.keywords.length} keyword(s) from ${config.keywordConfigPath}`,
  );
  console.log(`[config] webhook target: ${config.webhookUrl}`);
  console.log(`[config] ws tier: ${config.wsTier}`);

  if (config.trackAccounts.length > 0) {
    try {
      await ensureTrackedAccounts(config.apiKey, config.trackAccounts);
    } catch (err) {
      console.error(
        `[track] ${err instanceof Error ? err.message : String(err)}`,
      );
      console.error(
        "[track] continuing without updating the tracked-account list; " +
          "the feed will only carry events for accounts already tracked on this key.",
      );
    }
  }

  const client = new RouterClient(config);
  client.start();

  const shutdown = (signal: string) => {
    console.log(`\n[shutdown] received ${signal}, closing connection...`);
    client.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error(
    "Fatal error:",
    err instanceof Error ? (err.stack ?? err.message) : err,
  );
  process.exitCode = 1;
});
