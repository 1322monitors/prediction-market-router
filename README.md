# prediction-market-router

[![License: MIT](https://img.shields.io/github/license/SisoSol/prediction-market-router?style=flat-square&color=blue)](LICENSE) [![Last commit](https://img.shields.io/github/last-commit/SisoSol/prediction-market-router?style=flat-square)](https://github.com/SisoSol/prediction-market-router/commits) [![Built for 1322.io](https://img.shields.io/badge/built%20for-1322.io-3b82f6?style=flat-square)](https://1322.io) [![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](https://github.com/SisoSol/prediction-market-router/pulls)

A working example that turns a real-time Twitter/X feed into prediction-market signals: it holds a 1322 WebSocket, matches every incoming tweet from your tracked accounts against a keyword or phrase list, dedupes by tweet id, and POSTs a normalized JSON event to any webhook you configure (a queue, a serverless function, n8n/Zapier, or your own resolution pipeline). Maintained by the 1322 team. It is a generic signal router, not an integration with any specific prediction-market platform.

Point `WEBHOOK_URL` at whatever you use downstream - a queue, a serverless
function, your own resolution pipeline, Zapier/n8n, or a platform's API if
you've built that integration yourself.

## Use case

Prediction markets resolve on real-world events - an official statement, a
result being confirmed, an event being cancelled or postponed. If the
resolution-relevant account posts on X, the fastest way to know is a
persistent connection that pushes the post the moment it's detected, not a
browser tab you refresh. This example tracks one or more X accounts, matches
their posts against phrases relevant to your market's resolution criteria,
and hands off a clean, normalized event the instant one matches - before
you'd see it by refreshing X yourself.

The same shape (WebSocket in, keyword filter, webhook out) is useful beyond
prediction markets for any workflow that needs "notify me the moment a
tracked account says X."

## What you get per matched event

The webhook receives an HTTP POST with this JSON body (illustrative
structure, not a measured example):

```json
{
  "source": "1322",
  "account": "example_account",
  "matched_keywords": ["confirmed", "official statement"],
  "text": "Full text of the matched tweet.",
  "url": "https://x.com/example_account/status/1234567890123456789",
  "detected_at": "2026-07-28T12:00:00.000Z",
  "tweet_id": "1234567890123456789"
}
```

## Setup

```bash
git clone https://github.com/SisoSol/prediction-market-router.git
cd prediction-market-router
npm install
cp .env.example .env
cp config/keywords.example.json config/keywords.json
```

Edit `.env`:

| Variable | Required | Description |
|---|---|---|
| `X_API_KEY` | yes | Your 1322 X/Twitter API key. Must match the tier in `WS_TIER`. |
| `WEBHOOK_URL` | yes | Where matched events are POSTed as JSON. |
| `WS_TIER` | no | `normal` (default) or `ultimate`. |
| `KEYWORDS_FILE` | no | Path to the keyword config (default `config/keywords.json`). |
| `TRACK_ACCOUNTS` | no | Comma-separated usernames to add to your tracked list on startup. |
| `WEBHOOK_TIMEOUT_MS` | no | Webhook request timeout, default `5000`. |
| `DEDUP_TTL_MS` | no | How long a tweet id is remembered, default `600000` (10 min). |
| `DEDUP_MAX_ENTRIES` | no | Max tweet ids kept in the dedup cache, default `5000`. |

Get an API key and manage tracked accounts from the dashboard:
https://1322.io/pricing. The WebSocket only delivers events for accounts
already tracked on the key you connect with - set `TRACK_ACCOUNTS` to have
this tool add them for you on startup, or add them yourself via the
dashboard or the `POST /v1/tracked` endpoint documented at
https://1322.io/docs.

Edit `config/keywords.json`:

```json
{
  "keywords": [
    "official statement",
    "confirmed",
    "has been cancelled",
    "will resolve yes",
    "will resolve no",
    "final result",
    "postponed until"
  ],
  "case_sensitive": false
}
```

Each entry is matched as a literal substring against the tweet text
(case-insensitive unless `case_sensitive` is `true`). No regex, no fuzzy
matching - keep phrases specific enough to avoid noisy false positives. The
example list above is generic; replace it with phrases relevant to your own
market or use case.

Run it:

```bash
npm run build && npm start
# or, for local development without a build step:
npm run dev
```

```bash
node dist/index.js --help
```

## How it works

- Connects to `wss://ws.normal.1322.io/ws/normal` (or the `ultimate`
  endpoint, if configured) and authenticates with `X-API-Key`.
- Reads `tweet.mini.update`, `tweet.update`, and `tweet.update.expanded`
  events (tweets arrive progressively across these stages) and checks each
  one's text against your keyword list.
- Dedupes by tweet id, so a tweet that matches on an early stage doesn't fire
  the webhook again as later stages enrich it. The dedup cache is bounded by
  both size and age (`DEDUP_MAX_ENTRIES`, `DEDUP_TTL_MS`).
- On disconnect, reconnects with exponential backoff (1s, 2s, 4s, 8s, ...
  capped at 30s), matching the reconnection policy documented at
  https://1322.io/docs. No events are queued during a disconnect.
- Webhook delivery failures (non-2xx response, timeout, network error) are
  logged and do not crash the process or block the feed.

## Full API reference

This example only touches the X/Twitter WebSocket and the tracked-accounts
management endpoint. The 1322 API also covers Instagram, Truth Social,
YouTube, Binance Square, and news monitoring, plus the full X event/type
reference (profile events, media, cards, polls, articles, subtweet chains):
https://1322.io/docs

## Related

- [truthsocial-stream](https://github.com/SisoSol/truthsocial-stream) - Truth Social posts move the same markets
- [social-trading-signals](https://github.com/SisoSol/social-trading-signals) - strategy harness for social events
- [1322-client](https://github.com/SisoSol/1322-client) - typed client instead of raw WebSocket code

Other real-time monitoring examples from the 1322 team:

- [kol-tweet-alert-bot](https://github.com/SisoSol/kol-tweet-alert-bot)
- [twitter-websocket-client](https://github.com/SisoSol/twitter-websocket-client)
- [instagram-realtime](https://github.com/SisoSol/instagram-realtime)
- [binance-square-realtime](https://github.com/SisoSol/binance-square-realtime)
- [social-trading-signals](https://github.com/SisoSol/social-trading-signals)
- [social-monitor-examples](https://github.com/SisoSol/social-monitor-examples) (all platforms)
- [awesome-realtime-social-monitoring](https://github.com/SisoSol/awesome-realtime-social-monitoring)

MIT licensed.
