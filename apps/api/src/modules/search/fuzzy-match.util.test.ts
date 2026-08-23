import assert from 'node:assert/strict';
import { test } from 'node:test';

import { findFuzzyMatches, levenshteinDistance } from './fuzzy-match.util';

test('identical strings have distance 0', () => {
  assert.equal(levenshteinDistance('paracetamol', 'paracetamol'), 0);
});

test('a single typo has distance 1', () => {
  assert.equal(levenshteinDistance('paracetmol', 'paracetamol'), 1);
});

test('empty-string edge cases', () => {
  assert.equal(levenshteinDistance('', 'abc'), 3);
  assert.equal(levenshteinDistance('abc', ''), 3);
  assert.equal(levenshteinDistance('', ''), 0);
});

test('findFuzzyMatches suggests "paracetamol" for the typo "paracetmol" (example)', () => {
  const dictionary = ['paracetamol', 'ibuprofen', 'amoxicillin', 'cetirizine'];
  const matches = findFuzzyMatches('paracetmol', dictionary);
  assert.deepEqual(matches, ['paracetamol']);
});

test('findFuzzyMatches excludes an exact match (distance 0) from suggestions', () => {
  const dictionary = ['paracetamol', 'ibuprofen'];
  const matches = findFuzzyMatches('paracetamol', dictionary);
  assert.deepEqual(matches, []);
});

test('findFuzzyMatches returns nothing when everything is too far (bounded, no noisy suggestions)', () => {
  const dictionary = ['ibuprofen', 'amoxicillin'];
  const matches = findFuzzyMatches('paracetamol', dictionary);
  assert.deepEqual(matches, []);
});

test('findFuzzyMatches ranks closer matches first and respects the limit', () => {
  const dictionary = ['cetrizine', 'cetirizine', 'cetriz'];
  const matches = findFuzzyMatches('cetirizin', dictionary, 3, 2);
  assert.equal(matches.length, 2);
  assert.equal(matches[0], 'cetirizine'); // distance 1, closest
});

test('findFuzzyMatches on an empty query returns nothing', () => {
  assert.deepEqual(findFuzzyMatches('', ['paracetamol']), []);
});
