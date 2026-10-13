import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { accountKey, readStored, writeStored, migrateLegacyStorage } from '../src/utils/accountStorage.js';

beforeEach(() => {
  const data = new Map();
  globalThis.localStorage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)) };
});

test('legacy portfolios belong to one account; a second account cannot inherit them', () => {
  writeStored('aethertrade_portfolios_list', [{ id: 'default', transactions: [{ ticker: 'AAPL' }] }]);
  migrateLegacyStorage('alice');
  migrateLegacyStorage('bob');
  assert.equal(readStored(accountKey('aethertrade_portfolios_list', 'alice'), [])[0].transactions[0].ticker, 'AAPL');
  assert.equal(readStored(accountKey('aethertrade_portfolios_list', 'bob'), null), null);
});

test('recognizable existing cloud portfolio IDs cannot be claimed by another user', () => {
  writeStored('aethertrade_portfolios_list', [{ id: 'default_alice' }]);
  migrateLegacyStorage('bob');
  assert.equal(readStored(accountKey('aethertrade_portfolios_list', 'bob'), null), null);
  migrateLegacyStorage('alice');
  assert.equal(readStored(accountKey('aethertrade_portfolios_list', 'alice'), []).length, 1);
});

test('migration preserves old currency/target settings and does not overwrite newer scoped data', () => {
  writeStored('aethertrade_portfolios_list', [{ id: 'default' }]);
  writeStored('aethertrade_base_currencies', { default: 'THB' });
  writeStored('aethertrade_target_allocations', { default: { AAPL: 100 } });
  migrateLegacyStorage('alice');
  const key = accountKey('aethertrade_portfolios_list', 'alice');
  assert.equal(readStored(key, [])[0].baseCurrency, 'THB');
  assert.deepEqual(readStored(key, [])[0].targetAllocations, { AAPL: 100 });
  writeStored(key, [{ id: 'newer' }]);
  migrateLegacyStorage('alice');
  assert.equal(readStored(key, [])[0].id, 'newer');
});
