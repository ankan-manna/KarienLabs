/**
 * Part 5 — lightweight, bounded typo tolerance. Deliberately NOT a
 * full search-engine integration (Elasticsearch/Algolia/etc.) — per Part 5's
 * own instruction, "do not implement an unnecessarily complex search engine
 * if MongoDB search/indexing is sufficient for the current project scale."
 * This is plain Levenshtein edit-distance against a SMALL, pre-computed
 * dictionary (product-name/generic-name words), never against the whole
 * catalog per request.
 */

/** Standard DP Levenshtein edit distance. Bounded in practice — callers only ever pass short search-term strings (a handful to ~30 characters), so this is O(n*m) on tiny inputs, not a performance concern. */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i++) dp[i][0] = i;
  for (let j = 0; j < cols; j++) dp[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[rows - 1][cols - 1];
}

/**
 * Returns dictionary terms within `maxDistance` of `query`, closest first.
 * `dictionary` should be small (tens to low hundreds of terms) — this is a
 * linear scan, appropriate for a "did you mean" fallback, not a primary
 * search path.
 */
export function findFuzzyMatches(query: string, dictionary: string[], maxDistance = 2, limit = 5): string[] {
  if (!query) return [];
  const scored = dictionary
    .map((term) => ({ term, distance: levenshteinDistance(query, term) }))
    .filter((r) => r.distance > 0 && r.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance);
  return scored.slice(0, limit).map((r) => r.term);
}
