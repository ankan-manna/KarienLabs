import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildSearchCacheKey,
  escapeRegexLiteral,
  isQueryLengthValid,
  normalizeSearchQuery,
} from './search-normalize.util';

test('normalizes case, leading/trailing whitespace, and internal whitespace runs', () => {
  assert.equal(normalizeSearchQuery('  Paracetamol   500MG  '), 'paracetamol 500mg');
});

test('different-cased/whitespaced inputs normalize identically', () => {
  assert.equal(normalizeSearchQuery('PARACETAMOL'), normalizeSearchQuery('  paracetamol  '));
});

test('escapes every regex metacharacter so it matches literally', () => {
  const escaped = escapeRegexLiteral('a.b*c+d?e^f$g{h}i(j)k|l[m]n\\o');
  const re = new RegExp(escaped);
  assert.ok(re.test('a.b*c+d?e^f$g{h}i(j)k|l[m]n\\o'));
  // Confirms the metacharacters are NOT interpreted: "a.b" as a literal
  // string must not match "aXb" (which a live "." wildcard WOULD match).
  assert.equal(new RegExp(escapeRegexLiteral('a.b')).test('aXb'), false);
});

test('a catastrophic-backtracking-style payload is escaped to a harmless literal', () => {
  const payload = '(a+)+$';
  const escaped = escapeRegexLiteral(payload);
  // If this were compiled as a live regex it would be a classic ReDoS
  // pattern; escaped, it's just a literal string to search for.
  assert.doesNotThrow(() => new RegExp(escaped));
  assert.equal(new RegExp(escaped).test('(a+)+$'), true);
  assert.equal(new RegExp(escaped).test('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!'), false);
});

test('isQueryLengthValid accepts a query within [min,max]', () => {
  assert.equal(isQueryLengthValid('para', 2, 100), true);
});

test('isQueryLengthValid rejects a query shorter than the minimum', () => {
  assert.equal(isQueryLengthValid('p', 2, 100), false);
});

test('isQueryLengthValid rejects a query longer than the maximum', () => {
  assert.equal(isQueryLengthValid('a'.repeat(101), 2, 100), false);
});

test('buildSearchCacheKey is deterministic regardless of filter key insertion order', () => {
  const keyA = buildSearchCacheKey({
    namespace: 'products',
    normalizedQuery: 'paracetamol',
    filters: { categoryId: '1', brandId: '2' },
    sort: 'relevance',
    page: 1,
    limit: 20,
  });
  const keyB = buildSearchCacheKey({
    namespace: 'products',
    normalizedQuery: 'paracetamol',
    filters: { brandId: '2', categoryId: '1' },
    sort: 'relevance',
    page: 1,
    limit: 20,
  });
  assert.equal(keyA, keyB);
});

test('buildSearchCacheKey differs for different pages/filters/sort (no accidental collisions)', () => {
  const base = { namespace: 'products', normalizedQuery: 'paracetamol', sort: 'relevance', limit: 20 };
  const page1 = buildSearchCacheKey({ ...base, page: 1 });
  const page2 = buildSearchCacheKey({ ...base, page: 2 });
  assert.notEqual(page1, page2);

  const filteredA = buildSearchCacheKey({ ...base, page: 1, filters: { categoryId: 'a' } });
  const filteredB = buildSearchCacheKey({ ...base, page: 1, filters: { categoryId: 'b' } });
  assert.notEqual(filteredA, filteredB);
});

test('buildSearchCacheKey never embeds a customer/session identifier (only public params)', () => {
  const key = buildSearchCacheKey({ namespace: 'products', normalizedQuery: 'paracetamol' });
  assert.doesNotMatch(key, /user|customer|session|actor/i);
});
