import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rebuildPortfolioHoldings, validateLedger, investedCapital, dividendGross } from '../src/utils/portfolioLedger.js';
import { importTransactionsFromCSV, validateCSVImport } from '../src/utils/csvUtils.js';
import { calculateVolumeData } from '../src/utils/chartUtils.js';

const buy = { id: 'buy', ticker: 'AAPL', type: 'BUY', shares: 10, price: 100, fees: 2, timestamp: 1 };
const sell = { id: 'sell', ticker: 'AAPL', type: 'SELL', shares: 10, price: 120, fees: 1, timestamp: 2 };

test('fees, partial sales, and orphan dividends survive rebuilding without mutating the ledger', () => {
  const txs = [sell, { ...buy, type: 'DIVIDEND', shares: 10, price: 0.5, fees: 1, timestamp: 3 }, buy];
  const original = [...txs];
  const result = rebuildPortfolioHoldings(txs);
  assert.equal(result.realizedPLByCurrency.USD, 197);
  assert.equal(result.totalDividends, 4);
  assert.equal(result.dividendsByTicker.AAPL, 4);
  assert.equal(Object.keys(result.holdings).length, 0);
  assert.deepEqual(txs, original);
  const partial = rebuildPortfolioHoldings([buy, { ...sell, shares: 5 }]);
  assert.equal(partial.holdings.AAPL.totalFees, 1);
  assert.equal(partial.realizedPL, 98);
});

test('rejects backdated sales and edits/deletions that invalidate later sales', () => {
  assert.throws(() => validateLedger([buy, { ...sell, timestamp: 0 }]), /exceeds/);
  assert.throws(() => validateLedger([{ ...buy, shares: 1 }, sell]), /exceeds/);
  assert.throws(() => validateLedger([sell]), /exceeds/);
  for (const bad of [NaN, Infinity, -1]) assert.throws(() => validateLedger([{ ...buy, shares: bad }]));
});

test('same-day entry order is stable and numeric strings do not concatenate share counts', () => {
  const result = rebuildPortfolioHoldings([{ ...buy, shares: '10' }, { ...sell, timestamp: 1 }]);
  assert.equal(Object.keys(result.holdings).length, 0);
  const again = rebuildPortfolioHoldings([{ ...buy, shares: '10' }, { ...buy, shares: '10' }]);
  assert.equal(again.holdings.AAPL.shares, 20);
});

test('CSV replacement checks the replacement ledger without old purchases or sales', () => {
  const portfolios = [{ id: 'p', name: 'Primary', transactions: [buy] }];
  assert.doesNotThrow(() => validateCSVImport([sell], portfolios, 'p', true));
  assert.throws(() => validateCSVImport([sell], portfolios, 'p', false), /exceeds/);
  const oldSales = [{ id: 'p', name: 'Primary', transactions: [buy, sell] }];
  assert.doesNotThrow(() => validateCSVImport([{ ...buy, shares: 1 }], oldSales, 'p', false));
});

test('CSV dates reject calendar rollover and preserve execution timestamps', () => {
  const csv = date => `Date,Type,Symbol,Quantity,Price,Fee\n${date},BUY,AAPL,1,100,0`;
  for (const date of ['2025-02-31', '31/04/2025', '2025-13-01', '29/02/2025']) {
    assert.throws(() => importTransactionsFromCSV(csv(date)), /invalid/);
  }
  assert.equal(importTransactionsFromCSV(csv('2024-02-29')).length, 1);
  assert.equal(importTransactionsFromCSV(csv('2025-01-02T15:25:30.000Z'))[0].timestamp,
    Date.parse('2025-01-02T15:25:30.000Z'));
});

test('per-share dividends preserve their gross value during editing', () => {
  const dividend = importTransactionsFromCSV('Date,Type,Symbol,Quantity,Price,Fee\n2025-01-02,DIVIDEND,AAPL,100,0.5,1')[0];
  assert.equal(dividendGross(dividend), 50);
  const edited = { ...dividend, shares: 1, price: dividendGross(dividend), fees: 2 };
  assert.equal(rebuildPortfolioHoldings([edited]).totalDividends, 48);
});

test('closed-position cumulative ROI uses all purchases, including fees and mixed currencies', () => {
  const ledger = rebuildPortfolioHoldings([buy, sell]);
  const capital = investedCapital([buy, sell], 'USD', 35);
  assert.equal(capital, 1002);
  assert.ok(Math.abs(ledger.realizedPL / capital * 100 - 19.6606786427) < 1e-8);
  assert.equal(investedCapital([buy, { ...buy, ticker: 'PTT.BK', price: 35, fees: 0 }], 'USD', 35), 1012);
});

test('volume preserves zero and leaves missing values as gaps', () => {
  const data = [1, 2, 3].map(time => ({ time, close: 100, open: 95 }));
  assert.deepEqual(calculateVolumeData(data, [{ volume: '0' }, {}, { volume: '123' }]).map(p => p.value), [0, undefined, 123]);
});

test('same-day edits follow the database entry order rather than silently changing sales history', () => {
  const txs = [{ ...buy, ledger_order: 2, timestamp: 1 }, { ...sell, ledger_order: 1, timestamp: 1 }];
  assert.throws(() => validateLedger(txs), /exceeds/);
});

test('volume remains attached to its candle when rows are sorted or a synthetic line anchor is added', () => {
  const data = [{ time: 0, open: 10, close: 10, volume: null },
    { time: 1, open: 10, close: 11, volume: 200 }];
  assert.deepEqual(calculateVolumeData(data, [{ volume: 999 }]).map(p => p.value), [undefined, 200]);
});
