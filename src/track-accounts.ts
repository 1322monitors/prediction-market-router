import { REST_BASE_URL } from "./config.js";

interface TrackedAddResponse {
  success?: boolean;
  message?: string;
  tier?: string;
  results?: {
    successful?: unknown[];
    skipped?: unknown[];
    failed?: unknown[];
  };
}

/**
 * Optional convenience step: if TRACK_ACCOUNTS is set, ensure those X
 * usernames are on the tracked list for this API key before connecting to
 * the WebSocket, via POST /v1/tracked (https://1322.io/docs). The stream
 * only ever delivers events for accounts already tracked on the key used to
 * connect, so this exists to save a manual curl/dashboard step - it is not
 * required if the accounts are already tracked.
 */
export async function ensureTrackedAccounts(
  apiKey: string,
  usernames: string[],
): Promise<void> {
  if (usernames.length === 0) return;

  const res = await fetch(`${REST_BASE_URL}/v1/tracked`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({
      identifiers: usernames.join(","),
      type: "username",
    }),
  });

  let body: TrackedAddResponse | null = null;
  try {
    body = (await res.json()) as TrackedAddResponse;
  } catch {
    body = null;
  }

  if (!res.ok || !body || body.success !== true) {
    throw new Error(
      `Failed to add tracked accounts (${usernames.join(", ")}): ` +
        `HTTP ${res.status} ${body ? JSON.stringify(body) : "(no JSON body)"}`,
    );
  }

  const successful = body.results?.successful ?? [];
  const skipped = body.results?.skipped ?? [];
  const failed = body.results?.failed ?? [];

  console.log(
    `[track] tracked-account sync: ${successful.length} added/confirmed, ` +
      `${skipped.length} already tracked, ${failed.length} failed`,
  );

  if (failed.length > 0) {
    console.warn(`[track] identifiers that failed to add: ${JSON.stringify(failed)}`);
  }
}
