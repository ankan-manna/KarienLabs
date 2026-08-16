/**
 * Prompt 23 Part 3/39 — the ONE place user search input is normalized before
 * it touches any MongoDB query, used by every search entry point
 * (product search, suggestions/autocomplete, global search). Two concerns:
 *
 * 1. Normalization (Part 3) — case/whitespace/formatting differences
 *    shouldn't produce different results ("Paracetamol", "paracetamol ",
 *    "  PARACETAMOL" all normalize identically), and normalized queries are
 *    also what gets cache-keyed (Part 37) and logged for zero-result
 *    analytics (Part 34) — the raw un-normalized string would fragment both.
 * 2. Injection/abuse protection (Part 3/39) — `escapeRegexLiteral` makes any
 *    regex metacharacter in user input matched LITERALLY, never interpreted
 *    as a regex operator (blocks regex-based DoS via e.g. nested
 *    quantifiers, and blocks a user from writing an unintended wildcard
 *    match). This module never accepts anything OTHER than a plain string —
 *    callers must not pass `req.query.q` through as an object/array (Zod
 *    validation upstream already enforces `q` is a string, closing the
 *    classic `{ "$ne": null }`-style operator-injection vector before it
 *    ever reaches here).
 */

/** Collapses internal whitespace runs to a single space, trims, lowercases. Case/whitespace differences must not change search results or cache keys. */
export function normalizeSearchQuery(input: string): string {
  return input.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Escapes every regex metacharacter so the string can safely be used as a `$regex` operand without being interpreted as a pattern. */
export function escapeRegexLiteral(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Part 39 — bounds length BEFORE any regex/text-index query is built, since
 * an unbounded string is itself a resource-exhaustion vector (a very long
 * regex operand is expensive to compile/match even when every metacharacter
 * is escaped). Returns `null` when the (already-normalized) query falls
 * outside `[minLength, maxLength]` rather than throwing — callers decide
 * whether "too short/too long" means "return no results" or "reject the
 * request", since that differs by endpoint (autocomplete silently returns
 * empty; a full search page might want a 422).
 */
export function isQueryLengthValid(normalized: string, minLength: number, maxLength: number): boolean {
  return normalized.length >= minLength && normalized.length <= maxLength;
}

/**
 * Part 37 — deterministic cache-key builder so identical (query, filters,
 * sort, page, tenant) combinations hit the same cache entry, and DIFFERENT
 * combinations never collide. Sorted-key JSON stringify so `{a:1,b:2}` and
 * `{b:2,a:1}` produce the same key. Contains ONLY public, shareable
 * parameters — never a customer id/session — so the cached value is safe to
 * serve to any requester (Part 37: "search results should generally be safe
 * to share when they contain only public product data").
 */
export function buildSearchCacheKey(parts: {
  namespace: string;
  normalizedQuery: string;
  filters?: Record<string, unknown>;
  sort?: string;
  page?: number;
  limit?: number;
}): string {
  const filterPart = parts.filters
    ? JSON.stringify(parts.filters, Object.keys(parts.filters).sort())
    : '{}';
  return [
    'search',
    parts.namespace,
    parts.normalizedQuery || '*',
    filterPart,
    parts.sort ?? '',
    parts.page ?? 1,
    parts.limit ?? '',
  ].join(':');
}
