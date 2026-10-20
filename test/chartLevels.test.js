import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validLevels, visibleLevels } from '../src/components/research/chartLevels.js';

test('key chart levels select nearest support and resistance without changing saved prices', () => {
  const saved = [130, 80, 110, 90, 90, NaN, Infinity, -1, '95'];
  const before = [...saved];
  assert.deepEqual(validLevels(saved), [80, 90, 110, 130]);
  assert.deepEqual(visibleLevels(saved, 100, 'key'), [90, 110]);
  assert.deepEqual(visibleLevels(saved, 100, 'key', 80), [80, 90, 110]);
  assert.deepEqual(visibleLevels(saved, 100, 'off', 80), []);
  assert.deepEqual(visibleLevels(saved, 100, 'all'), [80, 90, 110, 130]);
  assert.deepEqual(saved, before);
});

test('key levels handle equality, one-sided prices, missing quotes and stale selections', () => {
  assert.deepEqual(visibleLevels([90, 100, 110], 100, 'key'), [100, 110]);
  assert.deepEqual(visibleLevels([80, 90], 100, 'key'), [90]);
  assert.deepEqual(visibleLevels([110, 120], 100, 'key'), [110]);
  assert.deepEqual(visibleLevels([90, 110], 0, 'key'), []);
  assert.deepEqual(visibleLevels([90, 110], NaN, 'key', 110), [110]);
  assert.deepEqual(visibleLevels([90, 110], 100, 'key', 120), [90, 110]);
});
