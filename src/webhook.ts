/**
 * Delivery of matched events to the configured outbound webhook.
 *
 * This intentionally posts a generic, normalized JSON payload to a plain
 * HTTP(S) endpoint you control. It does not integrate with any specific
 * prediction-market platform's API (Polymarket, Kalshi, or otherwise) -
 * point WEBHOOK_URL at your own ingestion endpoint, queue, or automation
 * tool to bridge into whichever platform you use.
 */

export interface OutboundEvent {
  source: "1322";
  account: string;
  matched_keywords: string[];
  text: string;
  url: string;
  detected_at: string;
  tweet_id: string;
}

export async function postWebhook(
  webhookUrl: string,
  payload: OutboundEvent,
  timeoutMs: number,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.error(
        `[webhook] non-2xx response (${res.status}) delivering tweet ${payload.tweet_id}`,
      );
    }
  } catch (err) {
    const reason =
      err instanceof Error && err.name === "AbortError"
        ? `timed out after ${timeoutMs}ms`
        : err instanceof Error
          ? err.message
          : String(err);
    console.error(
      `[webhook] failed to deliver tweet ${payload.tweet_id}: ${reason}`,
    );
  } finally {
    clearTimeout(timer);
  }
}
