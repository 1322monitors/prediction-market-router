import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const REST_BASE_URL = "https://api.1322.io";

const WS_URLS = {
  normal: "wss://ws.normal.1322.io/ws/normal",
  ultimate: "wss://ws.ultimate.1322.io/ws/ultimate",
} as const;

export type WsTier = keyof typeof WS_URLS;

export interface KeywordConfig {
  keywords: string[];
  case_sensitive: boolean;
}

export interface AppConfig {
  apiKey: string;
  wsTier: WsTier;
  wsUrl: string;
  webhookUrl: string;
  keywordConfigPath: string;
  keywordConfig: KeywordConfig;
  trackAccounts: string[];
  webhookTimeoutMs: number;
  dedupTtlMs: number;
  dedupMaxEntries: number;
}

/** Thrown for any user-fixable configuration problem (never a crash/stack trace). */
export class ConfigError extends Error {}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new ConfigError(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim().length === 0) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new ConfigError(
      `Environment variable ${name} must be a positive integer, got: "${raw}"`,
    );
  }
  return parsed;
}

export function loadKeywordConfig(path: string): KeywordConfig {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    throw new ConfigError(
      `Could not read keyword config file at "${path}". Copy ` +
        `config/keywords.example.json to config/keywords.json (or set ` +
        `KEYWORDS_FILE to a different path) and edit it. ` +
        `(${err instanceof Error ? err.message : String(err)})`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ConfigError(
      `Keyword config file at "${path}" is not valid JSON: ` +
        `${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as Record<string, unknown>).keywords)
  ) {
    throw new ConfigError(
      `Keyword config file at "${path}" must be a JSON object with a ` +
        `"keywords" array. See config/keywords.example.json for the format.`,
    );
  }

  const obj = parsed as { keywords: unknown[]; case_sensitive?: unknown };
  const keywords = obj.keywords
    .filter((k): k is string => typeof k === "string" && k.trim().length > 0)
    .map((k) => k.trim());

  if (keywords.length === 0) {
    throw new ConfigError(
      `Keyword config file at "${path}" has no non-empty keyword strings. ` +
        `Add at least one phrase to "keywords".`,
    );
  }

  const caseSensitive =
    typeof obj.case_sensitive === "boolean" ? obj.case_sensitive : false;

  return { keywords, case_sensitive: caseSensitive };
}

export function loadConfig(): AppConfig {
  const apiKey = requireEnv("X_API_KEY");
  const webhookUrl = requireEnv("WEBHOOK_URL");

  try {
    new URL(webhookUrl);
  } catch {
    throw new ConfigError(`WEBHOOK_URL is not a valid URL: "${webhookUrl}"`);
  }

  const tierRaw = (process.env.WS_TIER ?? "normal").trim().toLowerCase();
  if (tierRaw !== "normal" && tierRaw !== "ultimate") {
    throw new ConfigError(
      `WS_TIER must be "normal" or "ultimate", got: "${tierRaw}"`,
    );
  }
  const wsTier = tierRaw as WsTier;

  const keywordConfigPath = resolve(
    process.cwd(),
    process.env.KEYWORDS_FILE ?? "config/keywords.json",
  );
  const keywordConfig = loadKeywordConfig(keywordConfigPath);

  const trackAccounts = (process.env.TRACK_ACCOUNTS ?? "")
    .split(",")
    .map((s) => s.trim().replace(/^@/, ""))
    .filter((s) => s.length > 0);

  return {
    apiKey,
    wsTier,
    wsUrl: WS_URLS[wsTier],
    webhookUrl,
    keywordConfigPath,
    keywordConfig,
    trackAccounts,
    webhookTimeoutMs: parsePositiveIntEnv("WEBHOOK_TIMEOUT_MS", 5000),
    dedupTtlMs: parsePositiveIntEnv("DEDUP_TTL_MS", 10 * 60 * 1000),
    dedupMaxEntries: parsePositiveIntEnv("DEDUP_MAX_ENTRIES", 5000),
  };
}
