import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validStockValues } from '../src/utils/marketDataUtils.js';

test('partial, non-finite, and malformed candles never become portfolio prices', () => {
  const good = { datetime: '2025-01-02', open: '100', high: '110', low: '90', close: '105' };
  const values = [good, { ...good, close: 'nan' }, { ...good, close: 'Infinity' },
    { ...good, open: null }, { ...good, close: 0 }, { ...good, datetime: null }, null];
  assert.deepEqual(validStockValues(values), [good]);
});
