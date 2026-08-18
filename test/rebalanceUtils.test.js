import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateEqualSplit,
  normalizeTargets,
  calculateDrift,
  computeFullRebalance,
  computeDepositRebalance
} from '../src/utils/rebalanceUtils.js';

describe('Rebalance Utilities Pure Math Tests', () => {
  test('calculateEqualSplit generates exact 100% sum across varying counts', () => {
    const split2 = calculateEqualSplit(['AAPL', 'NVDA']);
    assert.deepEqual(split2, { AAPL: 50, NVDA: 50 });
    assert.equal(Object.values(split2).reduce((a, b) => a + b, 0), 100);

    const split3 = calculateEqualSplit(['AAPL', 'NVDA', 'MSFT']);
    assert.equal(Object.values(split3).reduce((a, b) => a + b, 0), 100);
    assert.equal(split3.AAPL, 33.34);
    assert.equal(split3.NVDA, 33.33);
    assert.equal(split3.MSFT, 33.33);

    const split5 = calculateEqualSplit(['A', 'B', 'C', 'D', 'E']);
    assert.equal(Object.values(split5).reduce((a, b) => a + b, 0), 100);
  });

  test('normalizeTargets scales proportions to exactly 100%', () => {
    const input = { AAPL: 10, NVDA: 20, MSFT: 10 }; // sum = 40
    const normalized = normalizeTargets(input);
    const sum = Object.values(normalized).reduce((a, b) => a + b, 0);
    assert.equal(sum, 100);
    assert.equal(normalized.NVDA, 50);
    assert.equal(normalized.AAPL, 25);
    assert.equal(normalized.MSFT, 25);
  });

  test('calculateDrift computes accurate overweight, underweight, and balanced states', () => {
    assert.deepEqual(calculateDrift(50.2, 50.0), { driftPct: 0.2, status: 'balanced' });
    assert.deepEqual(calculateDrift(60.0, 40.0), { driftPct: 20.0, status: 'overweight' });
    assert.deepEqual(calculateDrift(20.0, 35.0), { driftPct: -15.0, status: 'underweight' });
  });

  test('computeFullRebalance generates valid buy & sell orders with tolerance assertion', () => {
    // AAPL: 10 shares @ $100 = $1,000 (Current 66.67%, Target 50% -> Target $750, Overweight by $250 -> SELL 2.5 sh)
    // NVDA: 5 shares @ $100 = $500 (Current 33.33%, Target 50% -> Target $750, Underweight by $250 -> BUY 2.5 sh)
    const holdings = {
      AAPL: { shares: 10, avgCost: 100 },
      NVDA: { shares: 5, avgCost: 100 }
    };
    const targets = { AAPL: 50, NVDA: 50 };
    const stocks = {
      AAPL: { price: 100 },
      NVDA: { price: 100 }
    };

    const result = computeFullRebalance(holdings, targets, stocks);
    assert.equal(result.orders.length, 2);

    const sellOrder = result.orders.find(o => o.type === 'SELL');
    const buyOrder = result.orders.find(o => o.type === 'BUY');

    assert.ok(sellOrder);
    assert.equal(sellOrder.ticker, 'AAPL');
    assert.equal(sellOrder.shares, 2.5);
    assert.equal(sellOrder.total, 250);

    assert.ok(buyOrder);
    assert.equal(buyOrder.ticker, 'NVDA');
    assert.equal(buyOrder.shares, 2.5);
    assert.equal(buyOrder.total, 250);

    // Assert that total sells and buys are approximately equal within tolerance
    const tolerance = 0.50; // cents tolerance
    assert.ok(
      Math.abs(result.totalSells - result.totalBuys) <= tolerance,
      `Sells (${result.totalSells}) and Buys (${result.totalBuys}) should be within tolerance`
    );
  });

  test('computeDepositRebalance generates only BUY orders and respects deposit ceiling', () => {
    // AAPL: $600 (60%), NVDA: $400 (40%). Target: 50% AAPL, 50% NVDA.
    // Deposit: $500. Total = $1,500. Target AAPL = $750, Target NVDA = $750.
    // AAPL shortfall = $150, NVDA shortfall = $350. Total shortfall = $500.
    const holdings = {
      AAPL: { shares: 6, avgCost: 100 },
      NVDA: { shares: 4, avgCost: 100 }
    };
    const targets = { AAPL: 50, NVDA: 50 };
    const stocks = {
      AAPL: { price: 100 },
      NVDA: { price: 100 }
    };

    const deposit = 500;
    const result = computeDepositRebalance(holdings, targets, stocks, deposit);

    assert.ok(result.orders.every(o => o.type === 'BUY'), 'Deposit mode must only produce BUY orders');
    assert.ok(result.totalBuys <= deposit, 'Total buys must not exceed deposit');

    const aaplOrder = result.orders.find(o => o.ticker === 'AAPL');
    const nvdaOrder = result.orders.find(o => o.ticker === 'NVDA');

    assert.ok(aaplOrder);
    assert.equal(aaplOrder.shares, 1.5);
    assert.equal(aaplOrder.total, 150);

    assert.ok(nvdaOrder);
    assert.equal(nvdaOrder.shares, 3.5);
    assert.equal(nvdaOrder.total, 350);
  });

  test('computeDepositRebalance handles surplus (deposit > total shortfall)', () => {
    const holdings = {
      AAPL: { shares: 10, avgCost: 100 } // $1,000 (100%)
    };
    const targets = { AAPL: 50, NVDA: 50 };
    const stocks = {
      AAPL: { price: 100 },
      NVDA: { price: 100 }
    };

    // Deposit $2,000. Projected = $3,000.
    // Targets: AAPL $1,500 (shortfall $500), NVDA $1,500 (shortfall $1,500).
    // Total shortfall = $2,000.
    const deposit = 2000;
    const result = computeDepositRebalance(holdings, targets, stocks, deposit);
    assert.ok(result.totalBuys <= deposit);
    assert.equal(result.orders.length, 2);
  });

  test('computeFullRebalance clamps sells to owned shares and ignores dust', () => {
    const holdings = {
      AAPL: { shares: 0.0000001, avgCost: 100 } // dust position < 1e-6
    };
    const targets = { NVDA: 100 };
    const stocks = {
      AAPL: { price: 100 },
      NVDA: { price: 100 }
    };

    const result = computeFullRebalance(holdings, targets, stocks);
    assert.equal(result.orders.length, 0, 'Dust positions should be ignored');
  });

  test('computeFullRebalance accurately rebalances mixed USD and THB assets', () => {
    // AAPL: 10 shares @ $100 USD = $1,000 USD (50%)
    // PTT.BK: 100 shares @ 350 THB = 35,000 THB = $1,000 USD (50% at 35 THB/USD)
    // Target: 75% AAPL ($1,500), 25% PTT.BK ($500)
    const holdings = {
      AAPL: { shares: 10, avgCost: 100 },
      'PTT.BK': { shares: 100, avgCost: 350 }
    };
    const targets = { AAPL: 75, 'PTT.BK': 25 };
    const stocks = {
      AAPL: { price: 100 },
      'PTT.BK': { price: 350 }
    };
    const currencies = { AAPL: 'USD', 'PTT.BK': 'THB' };
    const fxRate = 35.0; // 1 USD = 35 THB

    const result = computeFullRebalance(holdings, targets, stocks, currencies, 'USD', fxRate);
    assert.equal(result.orders.length, 2);

    const sellOrder = result.orders.find(o => o.type === 'SELL');
    const buyOrder = result.orders.find(o => o.type === 'BUY');

    assert.ok(sellOrder);
    assert.equal(sellOrder.ticker, 'PTT.BK');
    assert.equal(sellOrder.shares, 50); // 50 sh @ 350 THB = 17,500 THB = $500 USD
    assert.equal(sellOrder.total, 17500);
    assert.equal(sellOrder.totalBase, 500);

    assert.ok(buyOrder);
    assert.equal(buyOrder.ticker, 'AAPL');
    assert.equal(buyOrder.shares, 5); // 5 sh @ $100 USD = $500 USD
    assert.equal(buyOrder.total, 500);
    assert.equal(buyOrder.totalBase, 500);
  });

  test('computeDepositRebalance respects deposit ceiling and currency conversion', () => {
    // AAPL: 10 shares @ $100 USD = $1,000 USD (100%)
    // Target: 50% AAPL, 50% PTT.BK
    // Deposit: $1,000 USD. Projected Total: $2,000 USD. Target PTT.BK = $1,000 USD (= 35,000 THB).
    const holdings = {
      AAPL: { shares: 10, avgCost: 100 }
    };
    const targets = { AAPL: 50, 'PTT.BK': 50 };
    const stocks = {
      AAPL: { price: 100 },
      'PTT.BK': { price: 35 } // 35 THB per share
    };
    const currencies = { AAPL: 'USD', 'PTT.BK': 'THB' };
    const fxRate = 35.0;
    const deposit = 1000; // $1,000 USD

    const result = computeDepositRebalance(holdings, targets, stocks, deposit, currencies, 'USD', fxRate);
    assert.equal(result.orders.length, 1);

    const pttOrder = result.orders[0];
    assert.equal(pttOrder.ticker, 'PTT.BK');
    assert.equal(pttOrder.shares, 1000); // 1000 sh @ 35 THB = 35,000 THB = $1,000 USD
    assert.equal(pttOrder.total, 35000);
    assert.equal(pttOrder.totalBase, 1000);
    assert.ok(result.totalBuys <= deposit);
  });

  test('computeFullRebalance is invariant to currencies argument passing shape (regression test)', () => {
    // AAPL: 10 shares @ $100 USD = $1,000 USD
    // PTT.BK: 100 shares @ 350 THB = 35,000 THB = $1,000 USD
    // Target: 75% AAPL, 25% PTT.BK
    const holdings = {
      AAPL: { shares: 10, avgCost: 100 },
      'PTT.BK': { shares: 100, avgCost: 350 }
    };
    const targets = { AAPL: 75, 'PTT.BK': 25 };
    const stocks = {
      AAPL: { price: 100 },
      'PTT.BK': { price: 350 }
    };
    const currencies = { AAPL: 'USD', 'PTT.BK': 'THB' };
    const fxRate = 35.0;

    // Explicit currencies object
    const resExplicit = computeFullRebalance(holdings, targets, stocks, currencies, 'USD', fxRate);
    // Undefined currencies (relies on auto-detect fallback)
    const resUndefined = computeFullRebalance(holdings, targets, stocks, undefined, 'USD', fxRate);
    // 5-arg overload call (string in baseCurrency position)
    const resOverload = computeFullRebalance(holdings, targets, stocks, 'USD', fxRate);

    assert.deepEqual(resExplicit.orders, resUndefined.orders, 'Explicit currencies and undefined currencies should yield identical orders');
    assert.deepEqual(resExplicit.orders, resOverload.orders, 'Explicit currencies and 5-arg overload should yield identical orders');
    assert.equal(resUndefined.baseCurrency, 'USD');
    assert.equal(resOverload.baseCurrency, 'USD');

    // Verify correct trade direction: Sell PTT.BK, Buy AAPL
    const sellPTT = resUndefined.orders.find(o => o.ticker === 'PTT.BK');
    const buyAAPL = resUndefined.orders.find(o => o.ticker === 'AAPL');
    assert.equal(sellPTT.type, 'SELL');
    assert.equal(sellPTT.shares, 50);
    assert.equal(buyAAPL.type, 'BUY');
    assert.equal(buyAAPL.shares, 5);
  });
});
