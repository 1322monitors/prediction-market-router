import WebSocket from "ws";
import type { AppConfig } from "./config.js";
import { DedupCache } from "./dedup.js";
import { matchKeywords } from "./matcher.js";
import type { OutboundEvent } from "./webhook.js";
import { postWebhook } from "./webhook.js";
import type { TweetTextEvent, WebsocketWorkerEvent } from "./types.js";
import { isTweetTextEvent } from "./types.js";

const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;

/**
 * Connects to the 1322 X WebSocket feed, applies the keyword matcher to
 * every tweet-text event, dedupes by tweet id, and forwards matches to the
 * configured webhook. Reconnects with the documented exponential backoff
 * (1s, 2s, 4s, 8s, ... capped at 30s) on disconnect.
 * https://1322.io/docs (X / Twitter -> WebSocket Guide -> Reconnection)
 */
export class RouterClient {
  private ws: WebSocket | null = null;
  private backoffMs = INITIAL_BACKOFF_MS;
  private shuttingDown = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly dedup: DedupCache;

  constructor(private readonly config: AppConfig) {
    this.dedup = new DedupCache(config.dedupMaxEntries, config.dedupTtlMs);
  }

  start(): void {
    this.connect();
  }

  stop(): void {
    this.shuttingDown = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
  }

  private connect(): void {
    console.log(
      `[ws] connecting to ${this.config.wsUrl} (${this.config.wsTier} tier)...`,
    );

    const ws = new WebSocket(this.config.wsUrl, {
      headers: { "X-API-Key": this.config.apiKey },
    });
    this.ws = ws;

    ws.on("open", () => {
      console.log("[ws] connected");
      // A successful connection resets the backoff, per the documented policy.
      this.backoffMs = INITIAL_BACKOFF_MS;
    });

    ws.on("message", (data: WebSocket.RawData) => {
      this.handleMessage(data);
    });

    // Protocol-level WebSocket ping/pong is handled automatically by the
    // `ws` library. This listener is just a visibility hook, not required
    // for correctness.
    ws.on("ping", () => {
      // ws has already queued the pong reply by the time this fires.
    });

    ws.on("close", (code: number, reason: Buffer) => {
      this.ws = null;
      if (this.shuttingDown) return;
      const reasonText = reason.length > 0 ? `, reason: ${reason.toString()}` : "";
      console.warn(
        `[ws] disconnected (code ${code}${reasonText}), reconnecting in ${this.backoffMs}ms`,
      );
      this.scheduleReconnect();
    });

    ws.on("error", (err: Error) => {
      console.error(`[ws] connection error: ${err.message}`);
      // 'close' always follows 'error' for connection failures in `ws`;
      // the reconnect is scheduled from the 'close' handler above.
    });
  }

  private scheduleReconnect(): void {
    if (this.shuttingDown) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.backoffMs);
    this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
  }

  private handleMessage(data: WebSocket.RawData): void {
    let evt: WebsocketWorkerEvent;
    try {
      evt = JSON.parse(data.toString());
    } catch {
      console.warn("[ws] received a non-JSON frame, ignoring");
      return;
    }

    if (!evt || typeof evt.type !== "string") return;

    // Defensive fallback in case the server ever sends an application-level
    // {"type":"ping"} text frame in addition to protocol-level pings.
    if (evt.type === "ping") {
      this.ws?.send(JSON.stringify({ type: "pong" }));
      return;
    }

    if (!isTweetTextEvent(evt)) return;

    this.processTweetEvent(evt);
  }

  private processTweetEvent(evt: TweetTextEvent): void {
    const { tweet } = evt;
    if (!tweet || !tweet.id || typeof tweet.body?.text !== "string") return;

    // Dedup by tweet id: a tweet arrives as multiple progressive stages
    // (mini -> update -> expanded); only the first match per tweet id fires.
    if (this.dedup.hasFired(tweet.id)) return;

    const { matched, keywords } = matchKeywords(
      tweet.body.text,
      this.config.keywordConfig.keywords,
      this.config.keywordConfig.case_sensitive,
    );

    if (!matched) return;

    this.dedup.markFired(tweet.id);

    const account = tweet.author?.handle ?? "unknown";
    const payload: OutboundEvent = {
      source: "1322",
      account,
      matched_keywords: keywords,
      text: tweet.body.text,
      url: `https://x.com/${account}/status/${tweet.id}`,
      detected_at: new Date().toISOString(),
      tweet_id: tweet.id,
    };

    console.log(
      `[match] @${account} tweet ${tweet.id} matched [${keywords.join(", ")}] (via ${evt.type})`,
    );

    void postWebhook(this.config.webhookUrl, payload, this.config.webhookTimeoutMs);
  }
}
