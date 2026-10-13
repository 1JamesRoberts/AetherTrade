import { test, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { renderHook, act, cleanup } from '@testing-library/react';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document,
  localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
process.env.VITE_SUPABASE_URL = '';
process.env.VITE_SUPABASE_ANON_KEY = '';
const { supabase, isCloudEnabled } = await import('../src/lib/supabase.js');
const { usePortfolio } = await import('../src/hooks/usePortfolio.js');
const { useWatchlist } = await import('../src/hooks/useWatchlist.js');
const { useAuth } = await import('../src/hooks/useAuth.js');
const toast = () => {};
afterEach(() => cleanup());
after(() => dom.window.close());

test('offline sign-in opens the workspace without subscription crashes and persists trades on reload', async () => {
  assert.equal(isCloudEnabled, false);
  assert.equal(typeof supabase.channel, 'function');
  const auth = renderHook(() => useAuth(), { reactStrictMode: true });
  await act(async () => { await auth.result.current.signIn('alice@example.com', ''); });
  const user = auth.result.current.user;
  assert.equal(user.id, 'mock-alice%40example.com');
  const hook = renderHook(() => usePortfolio(toast, user), { reactStrictMode: true });
  await act(async () => {
    assert.equal(await hook.result.current.addTransaction(hook.result.current.activePortfolioId,
      { ticker: 'AAPL', type: 'BUY', shares: 2, price: 100, fees: 1, timestamp: Date.parse('2025-01-02') }), true);
  });
  assert.equal(hook.result.current.portfolios[0].holdings.AAPL.shares, 2);
  hook.unmount();
  const reloaded = renderHook(() => usePortfolio(toast, user));
  assert.equal(reloaded.result.current.portfolios[0].holdings.AAPL.shares, 2);
  reloaded.unmount();
  const bob = { id: 'mock-bob%40example.com' };
  const anotherAccount = renderHook(() => usePortfolio(toast, bob));
  assert.equal(anotherAccount.result.current.portfolios[0].transactions.length, 0);
});

test('offline removal of all symbols persists an empty watchlist and restores the active fallback', async () => {
  const user = { id: 'mock-watchlist' };
  const hook = renderHook(() => useWatchlist(user, toast), { reactStrictMode: true });
  await act(async () => {
    for (const ticker of [...hook.result.current.watchlist]) assert.equal(await hook.result.current.removeTicker(ticker), true);
  });
  assert.deepEqual(hook.result.current.watchlist, []);
  assert.equal(hook.result.current.activeTicker, 'AAPL');
  hook.unmount();
  const reloaded = renderHook(() => useWatchlist(user, toast));
  assert.deepEqual(reloaded.result.current.watchlist, []);
});
