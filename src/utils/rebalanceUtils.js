import { detectTickerCurrency, convertCurrency } from './currencyUtils.js';

/**
 * Pure calculation utilities for Portfolio Target Allocation & Rebalancing.
 */

/**
 * Calculates equal percentage allocation across a list of tickers, guaranteed to sum to 100.
 * @param {string[]} tickers
 * @returns {Record<string, number>}
 */
export function calculateEqualSplit(tickers) {
  if (!tickers || tickers.length === 0) return {};
  const count = tickers.length;
  const base = Math.floor((100 / count) * 100) / 100;
  const remainder = Math.round((100 - base * count) * 100) / 100;

  const result = {};
  tickers.forEach((ticker, idx) => {
    // Add leftover pennies to the first item so total is exactly 100.00
    result[ticker] = idx === 0 ? Math.round((base + remainder) * 100) / 100 : base;
  });
  return result;
}

/**
 * Normalizes target percentages proportionally so they sum to exactly 100.
 * @param {Record<string, number|string>} targets
 * @returns {Record<string, number>}
 */
export function normalizeTargets(targets) {
  if (!targets) return {};
  const entries = Object.entries(targets);
  if (entries.length === 0) return {};

  const numeric = entries.map(([ticker, val]) => [ticker, Math.max(0, parseFloat(val) || 0)]);
  const currentSum = numeric.reduce((acc, [, val]) => acc + val, 0);

  if (currentSum <= 0) {
    return calculateEqualSplit(entries.map(([k]) => k));
  }

  const normalized = {};
  let allocatedSum = 0;
  let maxTicker = numeric[0][0];
  let maxVal = -1;

  numeric.forEach(([ticker, val]) => {
    const pct = Math.floor((val / currentSum) * 10000) / 100;
    normalized[ticker] = pct;
    allocatedSum += pct;
    if (pct > maxVal) {
      maxVal = pct;
      maxTicker = ticker;
    }
  });

  const diff = Math.round((100 - allocatedSum) * 100) / 100;
  if (diff !== 0 && maxTicker) {
    normalized[maxTicker] = Math.round((normalized[maxTicker] + diff) * 100) / 100;
  }

  return normalized;
}

/**
 * Computes portfolio drift statistics.
 * @param {number} actualWeight
 * @param {number} targetWeight
 * @returns {{ driftPct: number, status: 'overweight' | 'underweight' | 'balanced' }}
 */
export function calculateDrift(actualWeight = 0, targetWeight = 0) {
  const drift = actualWeight - targetWeight;
  const roundedDrift = Math.round(drift * 10) / 10;
  let status = 'balanced';
  if (roundedDrift > 0.5) {
    status = 'overweight';
  } else if (roundedDrift < -0.5) {
    status = 'underweight';
  }
  return { driftPct: roundedDrift, status };
}

/**
 * Resolves stock price with fallback chain.
 * @param {string} ticker
 * @param {Record<string, any>} holdings
 * @param {Record<string, any>} stocks
 * @returns {number}
 */
export function resolveAssetPrice(ticker, holdings = {}, stocks = {}) {
  const stockPrice = parseFloat(stocks[ticker]?.price);
  if (!isNaN(stockPrice) && stockPrice > 0) return stockPrice;
  const avgCost = parseFloat(holdings[ticker]?.avgCost);
  if (!isNaN(avgCost) && avgCost > 0) return avgCost;
  return 0;
}

/**
 * Generates Full Rebalance trade orders (BUY underweight, SELL overweight)
 * Supports multi-currency portfolios (e.g. USD and THB) normalized to baseCurrency.
 * @param {Record<string, { shares: number, avgCost: number }>} holdings
 * @param {Record<string, number>} targets
 * @param {Record<string, any>} stocks
 * @param {Record<string, 'USD' | 'THB'>} [currencies={}]
 * @param {'USD' | 'THB'} [baseCurrency='USD']
 * @param {number} [fxRate=35.5]
 * @returns {{ orders: Array<any>, totalSells: number, totalBuys: number, netCashDelta: number, baseCurrency: string }}
 */
export function computeFullRebalance(
  holdings = {},
  targets = {},
  stocks = {},
  currencies = {},
  baseCurrency = 'USD',
  fxRate = 35.5
) {
  // Overload guard: if currencies is a string (e.g. 'USD' or 'THB'), shift arguments
  let actualCurrencies = currencies;
  let actualBaseCurrency = baseCurrency;
  let actualFxRate = fxRate;

  if (typeof currencies === 'string') {
    actualCurrencies = {};
    actualBaseCurrency = currencies;
    actualFxRate = typeof baseCurrency === 'number' ? baseCurrency : (parseFloat(baseCurrency) || 35.5);
  }
  if (!actualCurrencies || typeof actualCurrencies !== 'object') {
    actualCurrencies = {};
  }
  if (typeof actualFxRate !== 'number' || isNaN(actualFxRate) || actualFxRate <= 0) {
    actualFxRate = 35.5;
  }

  const allTickers = Array.from(
    new Set([...Object.keys(holdings || {}), ...Object.keys(targets || {})])
  ).filter(t => (holdings[t]?.shares || 0) > 0 || (targets[t] || 0) > 0);

  let totalAssetValueBase = 0;
  const assetValuesBase = {};
  const assetPricesNative = {};
  const assetCurrencies = {};

  allTickers.forEach(ticker => {
    const priceNative = resolveAssetPrice(ticker, holdings, stocks);
    const shares = holdings[ticker]?.shares || 0;
    const valNative = shares * priceNative;
    const currency = actualCurrencies[ticker] || detectTickerCurrency(ticker);
    const valBase = convertCurrency(valNative, currency, actualBaseCurrency, actualFxRate);

    assetPricesNative[ticker] = priceNative;
    assetCurrencies[ticker] = currency;
    assetValuesBase[ticker] = valBase;
    totalAssetValueBase += valBase;
  });

  if (totalAssetValueBase <= 0) {
    return { orders: [], totalSells: 0, totalBuys: 0, netCashDelta: 0, baseCurrency: actualBaseCurrency };
  }

  const sellOrders = [];
  const buyOrders = [];
  let totalSellsBase = 0;
  let totalBuysBase = 0;

  allTickers.forEach(ticker => {
    const priceNative = assetPricesNative[ticker];
    if (priceNative <= 0) return;

    const currency = assetCurrencies[ticker];
    const currentValBase = assetValuesBase[ticker];
    const currentShares = holdings[ticker]?.shares || 0;
    const currentWeight = (currentValBase / totalAssetValueBase) * 100;
    const targetPct = Math.max(0, parseFloat(targets[ticker]) || 0);
    const targetValBase = (totalAssetValueBase * targetPct) / 100;
    const deltaValBase = targetValBase - currentValBase;
    const deltaValNative = convertCurrency(deltaValBase, actualBaseCurrency, currency, actualFxRate);

    // SELL Overweight (Delta < -0.01)
    if (deltaValBase < -0.01 && currentShares > 1e-6) {
      const rawSellShares = Math.abs(deltaValNative) / priceNative;
      // Clamp to owned shares and floor to 4 decimal places
      let sellShares = Math.min(rawSellShares, currentShares);
      sellShares = Math.floor(sellShares * 10000) / 10000;

      const orderTotalNative = sellShares * priceNative;
      const orderTotalBase = convertCurrency(orderTotalNative, currency, actualBaseCurrency, actualFxRate);
      if (sellShares >= 1e-6 && orderTotalNative >= 0.01) {
        totalSellsBase += orderTotalBase;
        sellOrders.push({
          ticker,
          type: 'SELL',
          shares: sellShares,
          price: priceNative,
          total: orderTotalNative,
          totalBase: orderTotalBase,
          currency,
          currentWeight,
          targetWeight: targetPct,
          deltaVal: deltaValBase
        });
      }
    }
    // BUY Underweight (Delta > +0.01)
    else if (deltaValBase > 0.01) {
      const rawBuyShares = deltaValNative / priceNative;
      const buyShares = Math.floor(rawBuyShares * 10000) / 10000;
      const orderTotalNative = buyShares * priceNative;
      const orderTotalBase = convertCurrency(orderTotalNative, currency, actualBaseCurrency, actualFxRate);
      if (buyShares >= 1e-6 && orderTotalNative >= 0.01) {
        totalBuysBase += orderTotalBase;
        buyOrders.push({
          ticker,
          type: 'BUY',
          shares: buyShares,
          price: priceNative,
          total: orderTotalNative,
          totalBase: orderTotalBase,
          currency,
          currentWeight,
          targetWeight: targetPct,
          deltaVal: deltaValBase
        });
      }
    }
  });

  return {
    orders: [...sellOrders, ...buyOrders],
    totalSells: Math.round(totalSellsBase * 100) / 100,
    totalBuys: Math.round(totalBuysBase * 100) / 100,
    netCashDelta: Math.round((totalSellsBase - totalBuysBase) * 100) / 100,
    baseCurrency: actualBaseCurrency
  };
}

/**
 * Generates Deposit / Cash Flow Rebalance trade orders (BUY underweight only).
 * Supports multi-currency portfolios normalized to baseCurrency.
 * @param {Record<string, { shares: number, avgCost: number }>} holdings
 * @param {Record<string, number>} targets
 * @param {Record<string, any>} stocks
 * @param {number} depositAmount
 * @param {Record<string, 'USD' | 'THB'>} [currencies={}]
 * @param {'USD' | 'THB'} [baseCurrency='USD']
 * @param {number} [fxRate=35.5]
 * @returns {{ orders: Array<any>, totalBuys: number, cashRemaining: number, baseCurrency: string }}
 */
export function computeDepositRebalance(
  holdings = {},
  targets = {},
  stocks = {},
  depositAmount = 0,
  currencies = {},
  baseCurrency = 'USD',
  fxRate = 35.5
) {
  // Overload guard: if 5th argument is a string (e.g. 'USD' or 'THB'), shift arguments
  let actualCurrencies = currencies;
  let actualBaseCurrency = baseCurrency;
  let actualFxRate = fxRate;

  if (typeof currencies === 'string') {
    actualCurrencies = {};
    actualBaseCurrency = currencies;
    actualFxRate = typeof baseCurrency === 'number' ? baseCurrency : (parseFloat(baseCurrency) || 35.5);
  }
  if (!actualCurrencies || typeof actualCurrencies !== 'object') {
    actualCurrencies = {};
  }
  if (typeof actualFxRate !== 'number' || isNaN(actualFxRate) || actualFxRate <= 0) {
    actualFxRate = 35.5;
  }

  const depositBase = Math.max(0, parseFloat(depositAmount) || 0);
  if (depositBase <= 0) {
    return { orders: [], totalBuys: 0, cashRemaining: 0, baseCurrency: actualBaseCurrency };
  }

  const allTickers = Array.from(
    new Set([...Object.keys(holdings || {}), ...Object.keys(targets || {})])
  ).filter(t => (holdings[t]?.shares || 0) > 0 || (targets[t] || 0) > 0);

  let currentTotalValueBase = 0;
  const assetValuesBase = {};
  const assetPricesNative = {};
  const assetCurrencies = {};

  allTickers.forEach(ticker => {
    const priceNative = resolveAssetPrice(ticker, holdings, stocks);
    const shares = holdings[ticker]?.shares || 0;
    const valNative = shares * priceNative;
    const currency = actualCurrencies[ticker] || detectTickerCurrency(ticker);
    const valBase = convertCurrency(valNative, currency, actualBaseCurrency, actualFxRate);

    assetPricesNative[ticker] = priceNative;
    assetCurrencies[ticker] = currency;
    assetValuesBase[ticker] = valBase;
    currentTotalValueBase += valBase;
  });

  const projectedTotalValueBase = currentTotalValueBase + depositBase;
  const shortfallsBase = {};
  let totalShortfallBase = 0;

  allTickers.forEach(ticker => {
    const targetPct = Math.max(0, parseFloat(targets[ticker]) || 0);
    const projectedTargetValBase = (projectedTotalValueBase * targetPct) / 100;
    const currentValBase = assetValuesBase[ticker] || 0;
    const shortfallBase = Math.max(0, projectedTargetValBase - currentValBase);
    shortfallsBase[ticker] = shortfallBase;
    totalShortfallBase += shortfallBase;
  });

  const allocatedCashBase = {};
  const targetSum = allTickers.reduce((acc, t) => acc + (Math.max(0, parseFloat(targets[t]) || 0)), 0) || 100;

  if (totalShortfallBase > 0) {
    if (depositBase <= totalShortfallBase) {
      allTickers.forEach(ticker => {
        allocatedCashBase[ticker] = depositBase * (shortfallsBase[ticker] / totalShortfallBase);
      });
    } else {
      // Eliminate all shortfalls first, then distribute surplus by target weights
      const surplusBase = depositBase - totalShortfallBase;
      allTickers.forEach(ticker => {
        const targetPct = Math.max(0, parseFloat(targets[ticker]) || 0);
        allocatedCashBase[ticker] = shortfallsBase[ticker] + surplusBase * (targetPct / targetSum);
      });
    }
  } else {
    // All positions already at or above projected target: distribute by target weights
    allTickers.forEach(ticker => {
      const targetPct = Math.max(0, parseFloat(targets[ticker]) || 0);
      allocatedCashBase[ticker] = depositBase * (targetPct / targetSum);
    });
  }

  const buyOrders = [];
  let totalBuysBase = 0;

  allTickers.forEach(ticker => {
    const priceNative = assetPricesNative[ticker];
    const cashBase = allocatedCashBase[ticker] || 0;
    const currency = assetCurrencies[ticker];
    if (priceNative <= 0 || cashBase <= 0) return;

    // Convert cash allocation from base currency to asset's native currency
    const cashNative = convertCurrency(cashBase, actualBaseCurrency, currency, actualFxRate);

    // Floor rounding ensures total spend does not exceed deposit
    const buyShares = Math.floor((cashNative / priceNative) * 10000) / 10000;
    const orderTotalNative = buyShares * priceNative;
    const orderTotalBase = convertCurrency(orderTotalNative, currency, actualBaseCurrency, actualFxRate);

    if (buyShares >= 1e-6 && orderTotalNative >= 0.01) {
      totalBuysBase += orderTotalBase;
      const currentValBase = assetValuesBase[ticker] || 0;
      const currentWeight = currentTotalValueBase > 0 ? (currentValBase / currentTotalValueBase) * 100 : 0;
      const targetPct = Math.max(0, parseFloat(targets[ticker]) || 0);

      buyOrders.push({
        ticker,
        type: 'BUY',
        shares: buyShares,
        price: priceNative,
        total: orderTotalNative,
        totalBase: orderTotalBase,
        currency,
        currentWeight,
        targetWeight: targetPct,
        allocatedCash: cashNative
      });
    }
  });

  return {
    orders: buyOrders,
    totalBuys: Math.round(totalBuysBase * 100) / 100,
    cashRemaining: Math.round(Math.max(0, depositBase - totalBuysBase) * 100) / 100,
    baseCurrency: actualBaseCurrency
  };
}
