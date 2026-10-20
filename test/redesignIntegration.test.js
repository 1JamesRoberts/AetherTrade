import { test, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { createElement } from 'react';

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
// Load React DOM after the browser globals so input/focus events use its DOM path.
const { render, fireEvent, act, cleanup } = await import('@testing-library/react');
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

test('Portfolio overview keeps account selection and ledger errors visible without mounting transaction entry', () => {
  const portfolios = [{ id: 'a', name: 'Long term', holdings: {}, transactions: [], ledgerError: 'Invalid sale' },
    { id: 'b', name: 'Income', holdings: {}, transactions: [] }];
  let selected;
  const ui = render(createElement(PortfolioManager, { overview: createElement('p', null, 'Portfolio summary'),
    portfolios, activePortfolioId: 'a', setActivePortfolioId: id => { selected = id; }, stocks: {} }));
  assert.ok(ui.getByText('Portfolio summary'));
  assert.match(ui.getByRole('alert').textContent, /Invalid sale/);
  assert.equal(ui.queryByLabelText('Shares Quantity'), null);
  fireEvent.change(ui.getByLabelText('Active portfolio'), { target: { value: 'b' } });
  assert.equal(selected, 'b');
});

test('Portfolio sections expose rebalancing and return to holdings without changing the ledger', async () => {
  const { default: PerformanceHoldings } = await vite.ssrLoadModule('/src/components/PerformanceHoldings.jsx');
  const portfolio = { id: 'empty', name: 'Review', baseCurrency: 'THB', holdings: {}, transactions: [], realizedPL: 0 };
  const before = JSON.stringify(portfolio);
  const ui = render(createElement(AppearanceProvider, null, createElement(PerformanceHoldings, {
    portfolios: [portfolio], activePortfolioId: 'empty', stocks: {}, showNotification: () => {} })));
  assert.ok(ui.getByText('Market value and P&L in THB. Prices and costs in each asset’s currency.'));
  const rebalance = ui.getByRole('button', { name: 'Rebalance', exact: true });
  fireEvent.click(rebalance);
  assert.equal(rebalance.getAttribute('aria-pressed'), 'true');
  assert.equal(ui.getByText('Keep your portfolio in balance').closest('[hidden]'), null);
  fireEvent.click(ui.getByRole('button', { name: 'Holdings 0' }));
  assert.ok(ui.getByText('Keep your portfolio in balance').closest('[hidden]'));
  assert.equal(JSON.stringify(portfolio), before);
});

test('redesigned dividend editor preserves gross value, withholding and execution time when saving', async () => {
  const { default: TradeOrderForm } = await vite.ssrLoadModule('/src/components/portfolio/TradeOrderForm.jsx');
  const tx = { id: 'div', ticker: 'AAPL', type: 'DIVIDEND', shares: 10, price: 2, fees: 1,
    account: 'Income', timestamp: Date.parse('2026-01-06T12:34:00Z') };
  const portfolio = { id: 'p', name: 'Income', holdings: {}, transactions: [tx] };
  let saved, canceled = false;
  const ui = render(createElement(TradeOrderForm, { activePortfolio: portfolio, stocks: {}, editingTxIndex: 0,
    editingTx: tx, onEditTransaction: async (...args) => { saved = args; return true; }, onCancelEdit: () => { canceled = true; } }));
  assert.equal(ui.getByLabelText('Total Dividend Received').value, '20');
  assert.match(ui.getByLabelText('Transaction estimate').textContent, /19\.00/);
  await act(async () => { fireEvent.click(ui.getByRole('button', { name: 'Save Changes' })); });
  assert.deepEqual(saved, ['p', 0, { timestamp: tx.timestamp, ticker: 'AAPL', type: 'DIVIDEND', shares: 1, price: 20, fees: 1, account: 'Income' }]);
  assert.equal(canceled, true);
});

test('audit filters retain the original transaction index after filtering', async () => {
  const { default: TransactionLedger } = await vite.ssrLoadModule('/src/components/portfolio/TransactionLedger.jsx');
  const transactions = [
    { id: 'buy', ticker: 'AAPL', type: 'BUY', shares: 10, price: 100, fees: 2, timestamp: 1000 },
    { id: 'div', ticker: 'AAPL', type: 'DIVIDEND', shares: 1, price: 20, fees: 1, timestamp: 2000 },
  ];
  let selection;
  const ui = render(createElement(TransactionLedger, { activePortfolio: { id: 'p', transactions }, onStartEdit: (...args) => { selection = args; } }));
  fireEvent.click(ui.getByRole('button', { name: 'Dividend', exact: true }));
  assert.equal(ui.getAllByRole('button', { name: 'Edit transaction entry' }).length, 1);
  fireEvent.click(ui.getByRole('button', { name: 'Edit transaction entry' }));
  assert.deepEqual(selection, [1, transactions[1]]);
  assert.match(ui.container.querySelector('summary').textContent, /19\.00/);
});

test('watchlist row selection and removal are separate actions; gain filters remain available', async () => {
  const { default: Watchlist } = await vite.ssrLoadModule('/src/components/Watchlist.jsx');
  const selected = [], removed = [];
  const ui = render(createElement(Watchlist, { watchlist: ['AAPL', 'MSFT'], activeTicker: 'AAPL',
    stocks: { AAPL: { ticker: 'AAPL', price: 100, change: 2, isLive: true }, MSFT: { ticker: 'MSFT', price: 200, change: -1, isLive: true } },
    setActiveTicker: ticker => selected.push(ticker), onRemoveTicker: ticker => removed.push(ticker), onAddTicker: () => {}, onToggleCollapse: () => {} }));
  fireEvent.click(ui.getByRole('button', { name: 'Research MSFT' }));
  fireEvent.click(ui.getByRole('button', { name: 'Remove MSFT from watchlist' }));
  assert.deepEqual(selected, ['MSFT']);
  assert.deepEqual(removed, ['MSFT']);
  fireEvent.click(ui.getByRole('button', { name: 'Gainers', exact: true }));
  assert.equal(ui.queryByRole('button', { name: 'Research MSFT' }), null);
  assert.ok(ui.getByRole('button', { name: 'Research AAPL' }));
});

test('rebalance mode and cash presets keep the existing deposit planner connected', async () => {
  const { default: RebalanceStudio } = await vite.ssrLoadModule('/src/components/RebalanceStudio.jsx');
  const portfolio = { id: 'p', name: 'Review', baseCurrency: 'USD', holdings: { AAPL: { shares: 10, avgCost: 100 } }, targetAllocations: { AAPL: 100 } };
  let prefilled;
  const ui = render(createElement(RebalanceStudio, { activePortfolio: portfolio, stocks: { AAPL: { price: 100 } }, onPrefillTrade: order => { prefilled = order; }, showNotification: () => {} }));
  assert.equal(ui.getByLabelText('Target weight for AAPL').value, '100');
  fireEvent.click(ui.getByRole('button', { name: 'Add cash', exact: true }));
  fireEvent.click(ui.getByRole('button', { name: '+$500', exact: true }));
  assert.equal(ui.getByLabelText(/Cash to invest/).value, '500');
  fireEvent.click(ui.getByRole('button', { name: 'Review entry', exact: true }));
  assert.equal(prefilled.ticker, 'AAPL');
  assert.equal(prefilled.type, 'BUY');
  assert.equal(prefilled.shares, 5);
  assert.equal(prefilled.price, 100);
});

test('purchase and sale controls retain quantities, prices, fees and edited execution time', async () => {
  const { default: TradeOrderForm } = await vite.ssrLoadModule('/src/components/portfolio/TradeOrderForm.jsx');
  for (const type of ['BUY', 'SELL']) {
    const tx = { id: 'trade', ticker: 'AAPL', type: 'BUY', shares: 10, price: 100, fees: 1,
      account: 'Review', timestamp: Date.parse('2026-01-06T12:34:00Z') };
    let saved;
    const ui = render(createElement(TradeOrderForm, { activePortfolio: { id: 'p', name: 'Review' }, stocks: {}, editingTxIndex: 0,
      editingTx: tx, onEditTransaction: async (_id, _index, value) => { saved = value; return true; }, onCancelEdit: () => {} }));
    fireEvent.click(ui.getByRole('button', { name: type === 'BUY' ? 'Buy' : 'Sell', exact: true }));
    fireEvent.change(ui.getByLabelText('Shares Quantity'), { target: { value: '2.5' } });
    fireEvent.change(ui.getByLabelText('Execution Price'), { target: { value: '125' } });
    fireEvent.change(ui.getByLabelText('Brokerage Fees'), { target: { value: '2' } });
    assert.match(ui.getByLabelText('Transaction estimate').textContent, type === 'BUY' ? /314\.50/ : /310\.50/);
    await act(async () => { fireEvent.click(ui.getByRole('button', { name: 'Save Changes' })); });
    assert.deepEqual(saved, { timestamp: tx.timestamp, ticker: 'AAPL', type, shares: 2.5, price: 125, fees: 2, account: 'Review' });
    ui.unmount();
  }
});

test('research navigation preserves mounted tools and the selected company context', async () => {
  const { default: ResearchWorkspace } = await vite.ssrLoadModule('/src/components/research/ResearchWorkspace.jsx');
  const { useState } = await import('react');
  let changes = 0;
  function StatefulChart() {
    const [count, setCount] = useState(0);
    return createElement('button', { onClick: () => setCount(value => value + 1) }, `Chart state ${count}`);
  }
  const props = { ticker: 'PTT.BK', stock: { name: 'PTT', price: 35.5, change: 1.2 }, count: 2, collapsed: false,
    onSectionChange: () => { changes++; }, onRefresh: () => {},
    watchlist: createElement('p', null, 'Saved symbols'), chart: createElement(StatefulChart), analysis: createElement('p', null, 'Saved scenarios') };
  const ui = render(createElement(ResearchWorkspace, { ...props, section: 'chart' }));
  assert.ok(ui.getByRole('heading', { name: 'PTT' }));
  assert.match(ui.container.querySelector('.research-quote').textContent, /THB/);
  fireEvent.click(ui.getByRole('button', { name: 'Chart state 0' }));
  fireEvent.click(ui.getByRole('button', { name: 'Company', exact: true }));
  assert.equal(changes, 1);
  ui.rerender(createElement(ResearchWorkspace, { ...props, section: 'analysis' }));
  assert.equal(ui.container.querySelector('.research-chart-slot').hidden, true);
  assert.equal(ui.container.querySelector('.research-analysis-slot').hidden, false);
  ui.rerender(createElement(ResearchWorkspace, { ...props, section: 'company' }));
  assert.ok(ui.getByRole('button', { name: 'Chart state 1' }));
  assert.equal(ui.getByRole('button', { name: 'Company', exact: true }).getAttribute('aria-pressed'), 'true');
});

test('research header distinguishes unavailable quotes and watchlist navigation', async () => {
  const { default: ResearchWorkspace } = await vite.ssrLoadModule('/src/components/research/ResearchWorkspace.jsx');
  let destination;
  const ui = render(createElement(ResearchWorkspace, { section: 'chart', ticker: 'AAPL', stock: {}, count: 0,
    onSectionChange: value => { destination = value; }, onRefresh: () => {}, loading: true }));
  assert.equal(ui.container.querySelector('.research-quote-value>strong').textContent, '—');
  assert.doesNotMatch(ui.container.querySelector('.research-quote-value').textContent, /0\.00%/);
  assert.ok(ui.getByRole('button', { name: 'Refresh price data' }).disabled);
  fireEvent.click(ui.getByRole('button', { name: 'Watchlist 0' }));
  assert.equal(destination, 'watchlist');
});

test('portfolio holding disclosures retain currency details and the correct sell action after filtering', async () => {
  const { default: HoldingsList } = await vite.ssrLoadModule('/src/components/portfolio/HoldingsList.jsx');
  const holdings = [
    { ticker: 'AAPL', name: 'Apple', shares: 10, currency: 'USD', currentPrice: 200, avgCost: 150, totalCost: 1502, baseMarketValue: 2000, basePnlVal: 498, pnlPct: 33.15 },
    { ticker: 'PTT.BK', name: 'PTT', shares: 100, currency: 'THB', currentPrice: 40, avgCost: 35, totalCost: 3505, baseMarketValue: 112.68, basePnlVal: 13.94, pnlPct: 14.12 },
  ];
  const portfolio = { holdings: {}, dividendsByTicker: { 'PTT.BK': 90 }, targetAllocations: { 'PTT.BK': 10 } };
  const before = JSON.stringify({ holdings, portfolio });
  let sold, sorted;
  const ui = render(createElement(HoldingsList, { holdings, activePortfolio: portfolio, totalAssetValue: 2112.68,
    baseCurrency: 'USD', sortColumn: 'marketValue', sortDirection: 'desc', onSort: value => { sorted = value; },
    onSellAll: (...args) => { sold = args; }, onRefresh: () => {} }));
  fireEvent.change(ui.getByRole('searchbox', { name: 'Find a holding' }), { target: { value: 'PTT' } });
  assert.equal(ui.queryByLabelText('Position details for AAPL'), null);
  fireEvent.click(ui.getByLabelText('Position details for PTT.BK'));
  assert.equal(ui.getByLabelText('Position details for PTT.BK').parentElement.open, true);
  assert.ok(ui.getByText('Average cost · THB'));
  assert.ok(ui.getByText('Dividend income · THB'));
  assert.match(ui.container.textContent, /฿90\.00/);
  fireEvent.change(ui.getByLabelText('Sort holdings'), { target: { value: 'avgCost' } });
  assert.equal(sorted, 'avgCost');
  fireEvent.click(ui.getByRole('button', { name: 'Sell All PTT.BK shares' }));
  assert.deepEqual(sold, ['PTT.BK', 100, 40]);
  assert.equal(JSON.stringify({ holdings, portfolio }), before);
});

test('chart levels separate viewing from one-shot drawing, cancel with Escape, and preserve other symbols', async () => {
  const { useState } = await import('react');
  const { default: useChartLevels } = await vite.ssrLoadModule('/src/components/research/useChartLevels.js');
  const { default: ChartLevelControls } = await vite.ssrLoadModule('/src/components/research/ChartLevelControls.jsx');
  function Harness() {
    const [ticker, setTicker] = useState('AAPL');
    const [linesMap, setLinesMap] = useState({ AAPL: [80, 90, 110, 120], MSFT: [300] });
    const [showLevels, setShowLevels] = useState(true);
    const controller = useChartLevels({ activeTicker: ticker, currentPrice: 100, linesMap, setLinesMap, showLevels, setShowLevels });
    return createElement('div', null,
      createElement(ChartLevelControls, { controller, ticker, currentPrice: 100 }),
      createElement('output', { 'aria-label': 'Saved levels' }, JSON.stringify(linesMap)),
      createElement('output', { 'aria-label': 'Shown levels' }, JSON.stringify(controller.shown)),
      createElement('button', { onClick: () => controller.handleChartPrice(95) }, 'Click chart at 95'),
      createElement('button', { onClick: () => setTicker(ticker === 'AAPL' ? 'MSFT' : 'AAPL') }, 'Switch symbol'));
  }
  const ui = render(createElement(Harness));
  const before = ui.getByLabelText('Saved levels').textContent;
  assert.equal(ui.getByLabelText('Shown levels').textContent, '[90,110]');
  fireEvent.click(ui.getByRole('button', { name: 'Click chart at 95' }));
  assert.equal(ui.getByLabelText('Saved levels').textContent, before);
  fireEvent.click(ui.getByRole('button', { name: 'All', exact: true }));
  assert.equal(ui.getByLabelText('Shown levels').textContent, '[80,90,110,120]');
  fireEvent.click(ui.getByRole('button', { name: 'Off', exact: true }));
  assert.equal(ui.getByLabelText('Shown levels').textContent, '[]');
  assert.equal(ui.getByLabelText('Saved levels').textContent, before);
  fireEvent.click(ui.getByRole('button', { name: 'Add level', exact: true }));
  fireEvent.keyDown(document, { key: 'Escape' });
  assert.equal(document.activeElement, ui.getByRole('button', { name: 'Add level', exact: true }));
  fireEvent.click(ui.getByRole('button', { name: 'Click chart at 95' }));
  assert.equal(ui.getByLabelText('Saved levels').textContent, before);
  fireEvent.click(ui.getByRole('button', { name: 'Add level', exact: true }));
  fireEvent.click(ui.getByRole('button', { name: 'Click chart at 95' }));
  assert.deepEqual(JSON.parse(ui.getByLabelText('Saved levels').textContent), { AAPL: [80, 90, 110, 120, 95], MSFT: [300] });
  assert.equal(ui.getByRole('button', { name: 'Add level', exact: true }).getAttribute('aria-pressed'), 'false');
  fireEvent.click(ui.getByRole('button', { name: 'Add level', exact: true }));
  fireEvent.click(ui.getByRole('button', { name: 'Switch symbol' }));
  assert.equal(ui.getByRole('button', { name: 'Add level', exact: true }).getAttribute('aria-pressed'), 'false');
  fireEvent.click(ui.getByRole('button', { name: 'Switch symbol' }));
  assert.equal(ui.getByRole('button', { name: 'Add level', exact: true }).getAttribute('aria-pressed'), 'false');
});

test('level manager supports exact THB prices, selection, removal, duplicate feedback and return focus', async () => {
  const { useState } = await import('react');
  const { default: useChartLevels } = await vite.ssrLoadModule('/src/components/research/useChartLevels.js');
  const { default: ChartLevelControls } = await vite.ssrLoadModule('/src/components/research/ChartLevelControls.jsx');
  // JSDOM does not implement native dialog opening; browser focus trapping is outside this test.
  const dialogPrototype = dom.window.HTMLDialogElement.prototype;
  const previousShow = dialogPrototype.showModal, previousClose = dialogPrototype.close;
  dialogPrototype.showModal = function () { this.open = true; };
  dialogPrototype.close = function () { this.open = false; this.dispatchEvent(new dom.window.Event('close')); };
  try {
    function Harness() {
      const [linesMap, setLinesMap] = useState({ 'PTT.BK': [70, 90, 110], AAPL: [200] });
      const [showLevels, setShowLevels] = useState(true);
      const controller = useChartLevels({ activeTicker: 'PTT.BK', currentPrice: 100, linesMap, setLinesMap, showLevels, setShowLevels });
      return createElement('div', null, createElement(ChartLevelControls, { controller, ticker: 'PTT.BK', currentPrice: 100 }),
        createElement('output', { 'aria-label': 'Saved levels' }, JSON.stringify(linesMap)),
        createElement('output', { 'aria-label': 'Shown levels' }, JSON.stringify(controller.shown)));
    }
    const ui = render(createElement(Harness));
    fireEvent.click(ui.getByRole('button', { name: 'Manage levels 3' }));
    assert.ok(ui.getByRole('dialog', { name: 'Price levels' }));
    fireEvent.click(ui.getByRole('button', { name: 'Highlight level ฿70.00' }));
    assert.equal(ui.getByLabelText('Shown levels').textContent, '[70,90,110]');
    assert.equal(document.activeElement, ui.getByRole('button', { name: 'Manage levels 3' }));
    fireEvent.click(ui.getByRole('button', { name: 'Manage levels 3' }));
    fireEvent.click(ui.getByRole('button', { name: 'Remove level ฿70.00' }));
    assert.equal(ui.getByLabelText('Shown levels').textContent, '[90,110]');
    const price = ui.getByLabelText('Add by price THB');
    fireEvent.change(price, { target: { value: '90.1' } });
    fireEvent.submit(price.closest('form'));
    assert.match(ui.getByRole('dialog').textContent, /already exists/);
    fireEvent.change(price, { target: { value: '85.75' } });
    fireEvent.submit(price.closest('form'));
    assert.deepEqual(JSON.parse(ui.getByLabelText('Saved levels').textContent), { 'PTT.BK': [90, 110, 85.75], AAPL: [200] });
    assert.equal(price.value, '');
  } finally {
    dialogPrototype.showModal = previousShow;
    dialogPrototype.close = previousClose;
  }
});

test('Sell All draft preserves the entire fractional position and waits for reviewed price and fees before saving', async () => {
  const { default: TradeOrderForm } = await vite.ssrLoadModule('/src/components/portfolio/TradeOrderForm.jsx');
  const shares = 12.123456789;
  const portfolio = { id: 'income', name: 'Income', baseCurrency: 'USD', holdings: { AAPL: { shares, avgCost: 150 } }, transactions: [] };
  const prefilledTrade = { ticker: 'AAPL', type: 'SELL', shares, price: 200, account: 'Income' };
  const before = JSON.stringify(portfolio);
  const saved = [];
  const props = { activePortfolio: portfolio, editingTxIndex: null, editingTx: null,
    stocks: { AAPL: { price: 200, name: 'Apple' } }, prefilledTrade,
    onAddTransaction: async (...args) => { saved.push(args); return true; }, showNotification: () => {} };
  const ui = render(createElement(TradeOrderForm, props));
  await act(async () => {});
  assert.equal(ui.getByLabelText('Shares Quantity').value, String(shares));
  assert.equal(ui.getByLabelText('Execution Price').value, '200');
  assert.equal(ui.getByLabelText('Investment Account').value, 'Income');
  assert.match(ui.getByLabelText('Transaction estimate').textContent, /Sale summary/);
  assert.equal(saved.length, 0);
  fireEvent.change(ui.getByLabelText('Execution Price'), { target: { value: '198.25' } });
  fireEvent.change(ui.getByLabelText('Brokerage Fees'), { target: { value: '2.75' } });
  ui.rerender(createElement(TradeOrderForm, { ...props, stocks: { AAPL: { price: 205, name: 'Apple' } } }));
  await act(async () => {});
  assert.equal(ui.getByLabelText('Execution Price').value, '198.25');
  assert.equal(saved.length, 0);
  await act(async () => { fireEvent.click(ui.getByRole('button', { name: 'Record Sell Order' })); });
  assert.equal(saved.length, 1);
  assert.equal(saved[0][0], 'income');
  assert.deepEqual({ ...saved[0][1], timestamp: 0 }, { timestamp: 0, ticker: 'AAPL', type: 'SELL', shares, price: 198.25, fees: 2.75, account: 'Income' });
  assert.equal(JSON.stringify(portfolio), before);
});

test('portfolio switches discard the scoped sale draft and do not resurrect it on return', async () => {
  const { useState } = await import('react');
  const portfolios = [
    { id: 'income', name: 'Income', holdings: { AAPL: { shares: 12.123456789, avgCost: 150 } }, transactions: [] },
    { id: 'retirement', name: 'Retirement', holdings: { AAPL: { shares: 50, avgCost: 150 } }, transactions: [] },
  ];
  let writes = 0;
  function Harness() {
    const [id, setId] = useState('income');
    const [draft, setDraft] = useState({ portfolioId: 'income', ticker: 'AAPL', type: 'SELL', shares: 12.123456789, price: 200, account: 'Income' });
    return createElement(PortfolioManager, { portfolios, activePortfolioId: id, setActivePortfolioId: setId,
      showAllocation: false, stocks: { AAPL: { price: 200 } }, prefilledTrade: draft,
      onClearPrefilledTrade: () => setDraft(null), onAddTransaction: () => { writes++; } });
  }
  const ui = render(createElement(Harness));
  await act(async () => {});
  assert.equal(ui.getByLabelText('Shares Quantity').value, '12.123456789');
  fireEvent.change(ui.getByLabelText('Active portfolio'), { target: { value: 'retirement' } });
  await act(async () => {});
  assert.equal(ui.getByLabelText('Investment Account').value, 'Retirement');
  assert.equal(ui.getByLabelText('Shares Quantity').value, '10');
  assert.match(ui.getByLabelText('Transaction estimate').textContent, /Purchase summary/);
  fireEvent.change(ui.getByLabelText('Active portfolio'), { target: { value: 'income' } });
  await act(async () => {});
  assert.equal(ui.getByLabelText('Shares Quantity').value, '10');
  assert.match(ui.getByLabelText('Transaction estimate').textContent, /Choose an asset/);
  assert.equal(writes, 0);
});

test('audit editing never applies a pending sale draft to the original transaction', async () => {
  const tx = { id: 'buy-msft', ticker: 'MSFT', type: 'BUY', shares: 10, price: 150, fees: 2,
    account: 'Income', timestamp: Date.parse('2026-01-06T12:00:00Z') };
  const portfolio = { id: 'income', name: 'Income', holdings: {}, transactions: [tx] };
  const before = JSON.stringify(portfolio);
  let saved;
  const ui = render(createElement(PortfolioManager, { initialTab: 'history', showAllocation: false,
    portfolios: [portfolio], activePortfolioId: 'income', setActivePortfolioId: () => {},
    stocks: { AAPL: { price: 200 }, MSFT: { price: 300 } },
    prefilledTrade: { portfolioId: 'income', ticker: 'AAPL', type: 'SELL', shares: 12.123456789, price: 200, account: 'Other broker' },
    onEditTransaction: async (...args) => { saved = args; return true; } }));
  fireEvent.click(ui.getByRole('button', { name: 'Edit transaction entry' }));
  await act(async () => {});
  assert.equal(ui.getByLabelText('Shares Quantity').value, '10');
  assert.equal(ui.getByLabelText('Execution Price').value, '150');
  assert.equal(ui.getByLabelText('Brokerage Fees').value, '2');
  assert.equal(ui.getByLabelText('Investment Account').value, 'Income');
  assert.match(ui.getByLabelText('Transaction estimate').textContent, /Purchase summary.*MSFT/);
  await act(async () => { fireEvent.click(ui.getByRole('button', { name: 'Save Changes' })); });
  assert.deepEqual(saved, ['income', 0, { timestamp: tx.timestamp, ticker: 'MSFT', type: 'BUY', shares: 10, price: 150, fees: 2, account: 'Income' }]);
  assert.equal(JSON.stringify(portfolio), before);
});

test('a stale portfolio draft is ignored even when the active portfolio changes programmatically', async () => {
  const portfolios = [{ id: 'a', name: 'Income', holdings: {}, transactions: [] }, { id: 'b', name: 'Retirement', holdings: {}, transactions: [] }];
  const props = { portfolios, activePortfolioId: 'a', setActivePortfolioId: () => {}, showAllocation: false,
    stocks: { AAPL: { price: 200 } }, prefilledTrade: { portfolioId: 'a', ticker: 'AAPL', type: 'SELL', shares: 12.123456789, price: 200, account: 'Income' } };
  const ui = render(createElement(PortfolioManager, props));
  await act(async () => {});
  ui.rerender(createElement(PortfolioManager, { ...props, activePortfolioId: 'b' }));
  await act(async () => {});
  assert.equal(ui.getByLabelText('Shares Quantity').value, '10');
  assert.equal(ui.getByLabelText('Investment Account').value, 'Retirement');
  assert.match(ui.getByLabelText('Transaction estimate').textContent, /Purchase summary.*Choose an asset/);
});
