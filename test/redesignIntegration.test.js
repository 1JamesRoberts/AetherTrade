import { test, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { createElement } from 'react';
import { render, fireEvent, act, cleanup } from '@testing-library/react';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
const media = new Map();
const matchMedia = query => {
  if (!media.has(query)) media.set(query, { matches: query.includes('color-scheme'), listeners: new Set(),
    addEventListener(_event, listener) { this.listeners.add(listener); },
    removeEventListener(_event, listener) { this.listeners.delete(listener); } });
  return media.get(query);
};
Object.assign(globalThis, { window: dom.window, document: dom.window.document,
  localStorage: dom.window.localStorage, matchMedia, IS_REACT_ACT_ENVIRONMENT: true });
process.env.VITE_SUPABASE_URL = '';
process.env.VITE_SUPABASE_ANON_KEY = '';
// Transform the actual JSX modules without launching a browser or listening server.
const vite = await createServer({ configFile: false, envDir: false, envPrefix: 'AETHER_REVIEW_PUBLIC_',
  plugins: [react()], cacheDir: '/private/tmp/aethertrade-redesign-tests',
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] } });
const { default: AppearanceProvider } = await vite.ssrLoadModule('/src/theme/AppearanceProvider.jsx');
const { useAppearance } = await vite.ssrLoadModule('/src/theme/appearanceContext.js');
const { default: PortfolioManager } = await vite.ssrLoadModule('/src/components/PortfolioManager.jsx');

function AppearanceProbe() {
  const appearance = useAppearance();
  return createElement('div', null,
    createElement('output', { 'aria-label': 'Resolved appearance' }, `${appearance.resolvedTheme}:${appearance.reducedMotion}`),
    createElement('button', { onClick: () => appearance.setPreference('Light') }, 'Use light'),
    createElement('button', { onClick: () => appearance.setPreference('System') }, 'Follow system'));
}
afterEach(() => { cleanup(); localStorage.clear(); });
after(async () => { await vite.close(); dom.window.close(); });

test('appearance follows device changes, supports an override and reduced motion, and preserves account data', async () => {
  localStorage.setItem('aethertrade_account_test_portfolios', 'original ledger');
  const ui = render(createElement(AppearanceProvider, null, createElement(AppearanceProbe)));
  assert.equal(ui.getByLabelText('Resolved appearance').textContent, 'dark:false');
  fireEvent.click(ui.getByRole('button', { name: 'Use light' }));
  assert.equal(document.documentElement.dataset.theme, 'light');
  assert.equal(localStorage.getItem('aethertrade_appearance'), 'Light');
  fireEvent.click(ui.getByRole('button', { name: 'Follow system' }));
  await act(async () => {
    for (const listener of matchMedia('(prefers-color-scheme: dark)').listeners) listener({ matches: false });
    for (const listener of matchMedia('(prefers-reduced-motion: reduce)').listeners) listener({ matches: true });
  });
  assert.equal(ui.getByLabelText('Resolved appearance').textContent, 'light:true');
  assert.equal(localStorage.getItem('aethertrade_account_test_portfolios'), 'original ledger');
});

test('Activity history opens the original editor with transaction identity and fees intact', () => {
  const tx = { id: 'stable-buy', ticker: 'AAPL', type: 'BUY', shares: 10, price: 190, fees: 1,
    account: 'Review', timestamp: Date.parse('2026-01-06T12:00:00Z') };
  const portfolio = { id: 'p', name: 'Review', baseCurrency: 'USD', transactions: [tx], holdings: {} };
  const ui = render(createElement(PortfolioManager, { initialTab: 'history', showAllocation: false,
    portfolios: [portfolio], activePortfolioId: 'p', stocks: { AAPL: { price: 227 } },
    setActivePortfolioId: () => {}, showNotification: () => {} }));
  assert.match(ui.container.textContent, /Transaction Audit History/);
  fireEvent.click(ui.getByRole('button', { name: 'Edit transaction entry' }));
  assert.match(ui.container.textContent, /Editing transaction/);
  assert.equal(ui.getByLabelText('Shares Quantity').value, '10');
  assert.equal(ui.getByLabelText('Execution Price').value, '190');
  assert.equal(ui.getByLabelText('Brokerage Fees').value, '1');
});
