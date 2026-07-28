/**
 * Keyword/entity matching rule.
 *
 * Deliberately simple and predictable: each configured phrase is checked as
 * a literal substring of the tweet text (case-insensitive by default). No
 * regex, no fuzzy/stem matching, no NLP. This keeps behavior easy to reason
 * about and easy to test; swap in a smarter matcher if your use case needs
 * one, this module is the only place that would need to change.
 */

export interface MatchResult {
  matched: boolean;
  /** The configured keywords (original casing) that matched, in config order. */
  keywords: string[];
}

export function matchKeywords(
  text: string,
  keywords: readonly string[],
  caseSensitive: boolean,
): MatchResult {
  const haystack = caseSensitive ? text : text.toLowerCase();
  const hits: string[] = [];

  for (const keyword of keywords) {
    const needle = caseSensitive ? keyword : keyword.toLowerCase();
    if (needle.length > 0 && haystack.includes(needle)) {
      hits.push(keyword);
    }
  }

  return { matched: hits.length > 0, keywords: hits };
}
