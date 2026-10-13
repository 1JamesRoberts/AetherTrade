import { test, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';
import { accountKey } from '../src/utils/accountStorage.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document,
  localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = 'test-key';
const { supabase } = await import('../src/lib/supabase.js');
const { usePortfolio } = await import('../src/hooks/usePortfolio.js');
const { useSyncedRecord } = await import('../src/hooks/useSyncedRecord.js');
const { useWatchlist } = await import('../src/hooks/useWatchlist.js');

const user = { id: 'alice', email: 'alice@example.com' };
const buy = { id: 'buy', portfolio_id: 'p', ticker: 'AAPL', type: 'BUY', shares: 10,
  price: 100, fees: 0, date: '2025-01-02T00:00:00Z', ledger_order: 1 };
let database, calls, events, notifications, transactionReadError, writeError, updateGate;
const toast = (message, type) => notifications.push({ message, type });
const EMPTY = {};

beforeEach(() => {
  localStorage.clear();
  database = { portfolios: [{ id: 'p', user_id: 'alice', name: 'Primary', base_currency: 'USD', target_allocations: {} }],
    transactions: [{ ...buy }], chart_annotations: [{ user_id: 'alice', lines_map: { AAPL: [100] } }],
    watchlists: [{ user_id: 'alice', tickers: ['AAPL', 'MSFT'] }] };
  calls = []; events = []; notifications = []; transactionReadError = null; writeError = null; updateGate = null;
  supabase.channel = () => ({
    on(_type, filter, callback) { events.push({ table: filter.table, callback }); return this; },
    subscribe() { return this; }
  });
  supabase.removeChannel = async () => 'ok';
  supabase.from = table => {
    const query = { op: 'select', filters: [], payload: null, singleRow: false, start: 0, end: Infinity,
      select() { return this; }, eq(key, value) { this.filters.push(row => row[key] === value); return this; },
      in(key, values) { this.filters.push(row => values.includes(row[key])); return this; },
      order() { return this; }, range(start, end) { this.start = start; this.end = end; return this; },
      maybeSingle() { this.singleRow = true; return this; }, single() { this.singleRow = true; return this; },
      update(payload) { this.op = 'update'; this.payload = payload; return this; },
      insert(payload) { this.op = 'insert'; this.payload = payload; return this; },
      upsert(payload) { this.op = 'upsert'; this.payload = payload; return this; },
      delete() { this.op = 'delete'; return this; },
      then(resolve, reject) {
        return (async () => {
          calls.push({ table, op: this.op, payload: this.payload });
          if (this.op === 'select' && table === 'transactions' && transactionReadError) return { data: null, error: { message: transactionReadError } };
          if (this.op !== 'select' && writeError) return { data: null, error: { message: writeError } };
          if (this.op === 'update' && updateGate) await updateGate;
          let rows = database[table].filter(row => this.filters.every(filter => filter(row)));
          if (this.op === 'insert') {
            rows = Array.isArray(this.payload) ? this.payload : [this.payload];
            database[table].push(...rows);
          } else if (this.op === 'upsert') {
            const index = database[table].findIndex(row => row.user_id === this.payload.user_id);
            if (index >= 0) database[table][index] = this.payload;
            else database[table].push(this.payload);
            rows = [this.payload];
          } else if (this.op === 'update') {
            rows.forEach(row => Object.assign(row, this.payload));
          } else if (this.op === 'delete') {
            database[table] = database[table].filter(row => !rows.includes(row));
          }
          rows = rows.slice(this.start, this.end + 1);
          return { data: this.singleRow ? rows[0] || null : structuredClone(rows), error: null };
        })().then(resolve, reject);
      }
    };
    return query;
  };
});
afterEach(() => cleanup());
after(async () => {
  await supabase.auth.getSession();
  await supabase.auth.dispose();
  dom.window.close();
});

async function mountPortfolio() {
  const hook = renderHook(() => usePortfolio(toast, user), { reactStrictMode: true });
  await waitFor(() => assert.equal(hook.result.current.dbLoaded, true));
  return hook;
}

test('failed cloud hydration preserves the account cache without attempting initialization', async () => {
  transactionReadError = 'Network unavailable';
  const cache = [{ id: 'p', name: 'Primary', transactions: [{ ...buy, timestamp: Date.parse(buy.date) }] }];
  localStorage.setItem(accountKey('aethertrade_portfolios_list', user.id), JSON.stringify(cache));
  const before = localStorage.getItem(accountKey('aethertrade_portfolios_list', user.id));
  const hook = renderHook(() => usePortfolio(toast, user), { reactStrictMode: true });
  await waitFor(() => assert.ok(notifications.some(n => n.message.includes('saved data was kept'))));
  assert.equal(hook.result.current.portfolios[0].transactions.length, 1);
  assert.equal(localStorage.getItem(accountKey('aethertrade_portfolios_list', user.id)), before);
  assert.equal(calls.filter(c => c.op !== 'select').length, 0);
});

test('concurrent React edit persists the stable transaction ID and waits for cloud confirmation', async () => {
  const hook = await mountPortfolio();
  let release;
  updateGate = new Promise(resolve => { release = resolve; });
  let saving;
  act(() => { saving = hook.result.current.editTransaction('p', 0, { ...hook.result.current.portfolios[0].transactions[0], price: 110 }); });
  await waitFor(() => assert.ok(calls.some(c => c.op === 'update')));
  assert.equal(hook.result.current.portfolios[0].transactions[0].price, 100);
  assert.equal(calls.find(c => c.op === 'update').payload.id, 'buy');
  await act(async () => { release(); assert.equal(await saving, true); });
  await waitFor(() => assert.equal(hook.result.current.portfolios[0].transactions[0].price, 110));
});

test('a rejected save leaves the ledger intact and never announces success', async () => {
  const hook = await mountPortfolio();
  writeError = 'Insert denied';
  await act(async () => {
    assert.equal(await hook.result.current.addTransaction('p', { ticker: 'AAPL', type: 'BUY', shares: 1,
      price: 100, fees: 0, timestamp: Date.parse('2025-01-03') }), false);
  });
  assert.equal(hook.result.current.portfolios[0].transactions.length, 1);
  assert.ok(notifications.some(n => n.type === 'error' && n.message.includes('Insert denied')));
  assert.equal(notifications.some(n => n.type === 'success'), false);
});

test('invalid backdated sales/deletions never reach the database; queued buys do not overwrite one another', async () => {
  const hook = await mountPortfolio();
  await act(async () => {
    assert.equal(await hook.result.current.addTransaction('p', { ticker: 'AAPL', type: 'SELL', shares: 1,
      price: 100, fees: 0, timestamp: Date.parse('2025-01-01') }), false);
  });
  assert.equal(calls.some(c => c.op === 'insert'), false);
  await act(async () => {
    const tx = { ticker: 'AAPL', type: 'BUY', shares: 1, price: 100, fees: 0, timestamp: Date.parse('2025-01-03') };
    const results = await Promise.all([hook.result.current.addTransaction('p', tx), hook.result.current.addTransaction('p', tx)]);
    assert.deepEqual(results, [true, true]);
  });
  await waitFor(() => assert.equal(hook.result.current.portfolios[0].holdings.AAPL.shares, 12));
});

test('annotation hydration and realtime reception never echo cloud updates', async () => {
  const hook = renderHook(() => useSyncedRecord(user, 'chart_annotations', 'lines_map', 'aethertrade_support_resistance', EMPTY, toast), { reactStrictMode: true });
  await waitFor(() => assert.deepEqual(hook.result.current[0], { AAPL: [100] }));
  assert.equal(calls.filter(c => c.op !== 'select').length, 0);
  database.chart_annotations[0].lines_map = { AAPL: [120] };
  await act(async () => { events.at(-1).callback(); });
  await waitFor(() => assert.deepEqual(hook.result.current[0], { AAPL: [120] }));
  assert.equal(calls.filter(c => c.op !== 'select').length, 0);
  await act(async () => { assert.equal(await hook.result.current[1](prev => ({ ...prev, MSFT: [200] })), true); });
  await waitFor(() => assert.equal(hook.result.current[0].MSFT[0], 200));
  assert.equal(calls.filter(c => c.op === 'upsert').length, 1);
});

test('empty cloud watchlists stay empty and cloud removal updates the active ticker', async () => {
  const hook = renderHook(() => useWatchlist(user, toast));
  await waitFor(() => assert.deepEqual(hook.result.current.watchlist, ['AAPL', 'MSFT']));
  act(() => hook.result.current.setActiveTicker('MSFT'));
  database.watchlists[0].tickers = ['AAPL'];
  await act(async () => { events.at(-1).callback(); });
  await waitFor(() => assert.equal(hook.result.current.activeTicker, 'AAPL'));
  database.watchlists[0].tickers = ['AAPL', 'MSFT'];
  await act(async () => { events.at(-1).callback(); });
  await waitFor(() => assert.deepEqual(hook.result.current.watchlist, ['AAPL', 'MSFT']));
  assert.equal(hook.result.current.activeTicker, 'AAPL');
  database.watchlists[0].tickers = [];
  await act(async () => { events.at(-1).callback(); });
  await waitFor(() => assert.deepEqual(hook.result.current.watchlist, []));
  assert.equal(calls.filter(c => c.op !== 'select').length, 0);
});

test('previously invalid cloud ledgers remain visible and can be repaired without deleting their history', async () => {
  database.transactions = [{ ...buy, shares: 1 }, { ...buy, id: 'sale', type: 'SELL', shares: 10,
    date: '2025-01-03T00:00:00Z', ledger_order: 2 }];
  const hook = await mountPortfolio();
  assert.equal(hook.result.current.portfolios[0].transactions.length, 2);
  assert.ok(hook.result.current.portfolios[0].ledgerError.includes('exceeds'));
  await act(async () => {
    assert.equal(await hook.result.current.editTransaction('p', 0,
      { ...hook.result.current.portfolios[0].transactions[0], shares: 10 }), true);
  });
  await waitFor(() => assert.equal(hook.result.current.portfolios[0].ledgerError, null));
  assert.equal(hook.result.current.portfolios[0].transactions.length, 2);
});
