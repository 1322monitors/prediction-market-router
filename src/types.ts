/**
 * Minimal subset of the 1322 X/Twitter WebSocket event schema that this
 * example actually reads. The full schema (author profile, media, cards,
 * polls, articles, subtweet chains, etc.) is documented at
 * https://1322.io/docs under "X / Twitter" -> "WS Data Types & Events".
 */

/** Base envelope present on every event the 1322 WebSocket sends. */
export interface WebsocketWorkerEvent {
  /** Unique id for this event; usable for debouncing/dedup across connections. */
  id: string;
  type: string;
  source: "1322";
}

export interface TweetAuthor {
  id: string;
  handle: string;
  name?: string;
}

export interface TweetBody {
  text: string;
}

export interface TweetMedia {
  images: string[];
  videos: string[];
}

/**
 * Shared shape of the fields this example reads from TwitterMiniTweet
 * (tweet.mini.update) and TwitterTweet (tweet.update / tweet.update.expanded
 * / tweet.deleted). Both interfaces carry these fields with identical names;
 * TwitterTweet just has many more fields beyond what this example needs.
 */
export interface TweetLike {
  id: string;
  created_at: number;
  author: TweetAuthor;
  body: TweetBody;
  media: TweetMedia;
}

export interface MiniTweetUpdate extends WebsocketWorkerEvent {
  type: "tweet.mini.update";
  tweet: TweetLike;
}

export interface TweetUpdate extends WebsocketWorkerEvent {
  type: "tweet.update";
  tweet: TweetLike;
}

export interface TweetUpdateExpanded extends WebsocketWorkerEvent {
  type: "tweet.update.expanded";
  tweet: TweetLike;
}

export interface TweetDeleted extends WebsocketWorkerEvent {
  type: "tweet.deleted";
  tweet: TweetLike;
  deleted_at: number;
}

/** The three progressive stages that carry tweet text worth matching against. */
export type TweetTextEvent = MiniTweetUpdate | TweetUpdate | TweetUpdateExpanded;

const TEXT_EVENT_TYPES = new Set<string>([
  "tweet.mini.update",
  "tweet.update",
  "tweet.update.expanded",
]);

export function isTweetTextEvent(
  evt: WebsocketWorkerEvent,
): evt is TweetTextEvent {
  return TEXT_EVENT_TYPES.has(evt.type);
}
