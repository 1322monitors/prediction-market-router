/**
 * Bounded, TTL-based cache of tweet ids that have already fired a webhook.
 *
 * X tweets arrive progressively (tweet.mini.update, then tweet.update, then
 * sometimes tweet.update.expanded), all sharing the same tweet id. Without
 * dedup, a tweet whose text matches a keyword would fire the webhook once
 * per stage. This cache ensures each tweet id fires at most once, per the
 * dedup-by-tweet-id guidance in the 1322 docs (https://1322.io/docs).
 *
 * Bounded by both entry count and age so a long-running process can't grow
 * this map without limit.
 */
export class DedupCache {
  private readonly seen = new Map<string, number>();

  constructor(
    private readonly maxEntries: number,
    private readonly ttlMs: number,
  ) {}

  hasFired(tweetId: string): boolean {
    this.evictExpired();
    return this.seen.has(tweetId);
  }

  markFired(tweetId: string): void {
    if (!this.seen.has(tweetId) && this.seen.size >= this.maxEntries) {
      const oldestKey = this.seen.keys().next().value;
      if (oldestKey !== undefined) {
        this.seen.delete(oldestKey);
      }
    }
    this.seen.set(tweetId, Date.now());
  }

  get size(): number {
    return this.seen.size;
  }

  private evictExpired(): void {
    const cutoff = Date.now() - this.ttlMs;
    // Map iterates in insertion order, and entries are inserted in
    // (roughly) chronological order, so the first non-expired entry means
    // everything after it is also non-expired.
    for (const [tweetId, firedAt] of this.seen) {
      if (firedAt < cutoff) {
        this.seen.delete(tweetId);
      } else {
        break;
      }
    }
  }
}
