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
 * Generates Full Rebalance trade orders (SELL overweight, BUY underweight).
 * @param {Record<string, { shares: number, avgCost: number }>} holdings
 * @param {Record<string, number>} targets
 * @param {Record<string, any>} stocks
 * @returns {{ orders: Array<any>, totalSells: number, totalBuys: number, netCashDelta: number }}
 */
export function computeFullRebalance(holdings = {}, targets = {}, stocks = {}) {
  const allTickers = Array.from(
    new Set([...Object.keys(holdings), ...Object.keys(targets)])
  ).filter(t => (holdings[t]?.shares || 0) > 0 || (targets[t] || 0) > 0);

  let totalAssetValue = 0;
  const assetValues = {};
  const assetPrices = {};

  allTickers.forEach(ticker => {
    const price = resolveAssetPrice(ticker, holdings, stocks);
    const shares = holdings[ticker]?.shares || 0;
    const val = shares * price;
    assetPrices[ticker] = price;
    assetValues[ticker] = val;
    totalAssetValue += val;
  });

  if (totalAssetValue <= 0) {
    return { orders: [], totalSells: 0, totalBuys: 0, netCashDelta: 0 };
  }

  const sellOrders = [];
  const buyOrders = [];
  let totalSells = 0;
  let totalBuys = 0;

  allTickers.forEach(ticker => {
    const price = assetPrices[ticker];
    if (price <= 0) return;

    const currentVal = assetValues[ticker];
    const currentShares = holdings[ticker]?.shares || 0;
    const currentWeight = (currentVal / totalAssetValue) * 100;
    const targetPct = Math.max(0, parseFloat(targets[ticker]) || 0);
    const targetVal = (totalAssetValue * targetPct) / 100;
    const deltaVal = targetVal - currentVal;

    // SELL Overweight (Delta < -0.01)
    if (deltaVal < -0.01 && currentShares > 1e-6) {
      const rawSellShares = Math.abs(deltaVal) / price;
      // Clamp to owned shares and floor to 4 decimal places
      let sellShares = Math.min(rawSellShares, currentShares);
      sellShares = Math.floor(sellShares * 10000) / 10000;

      const orderTotal = sellShares * price;
      if (sellShares >= 1e-6 && orderTotal >= 0.01) {
        totalSells += orderTotal;
        sellOrders.push({
          ticker,
          type: 'SELL',
          shares: sellShares,
          price,
          total: orderTotal,
          currentWeight,
          targetWeight: targetPct,
          deltaVal
        });
      }
    }
    // BUY Underweight (Delta > +0.01)
    else if (deltaVal > 0.01) {
      const rawBuyShares = deltaVal / price;
      const buyShares = Math.floor(rawBuyShares * 10000) / 10000;
      const orderTotal = buyShares * price;
      if (buyShares >= 1e-6 && orderTotal >= 0.01) {
        totalBuys += orderTotal;
        buyOrders.push({
          ticker,
          type: 'BUY',
          shares: buyShares,
          price,
          total: orderTotal,
          currentWeight,
          targetWeight: targetPct,
          deltaVal
        });
      }
    }
  });

  return {
    orders: [...sellOrders, ...buyOrders],
    totalSells: Math.round(totalSells * 100) / 100,
    totalBuys: Math.round(totalBuys * 100) / 100,
    netCashDelta: Math.round((totalSells - totalBuys) * 100) / 100
  };
}

/**
 * Generates Deposit / Cash Flow Rebalance trade orders (BUY underweight only).
 * @param {Record<string, { shares: number, avgCost: number }>} holdings
 * @param {Record<string, number>} targets
 * @param {Record<string, any>} stocks
 * @param {number} depositAmount
 * @returns {{ orders: Array<any>, totalBuys: number, cashRemaining: number }}
 */
export function computeDepositRebalance(holdings = {}, targets = {}, stocks = {}, depositAmount = 0) {
  const deposit = Math.max(0, parseFloat(depositAmount) || 0);
  if (deposit <= 0) {
    return { orders: [], totalBuys: 0, cashRemaining: 0 };
  }

  const allTickers = Array.from(
    new Set([...Object.keys(holdings), ...Object.keys(targets)])
  ).filter(t => (holdings[t]?.shares || 0) > 0 || (targets[t] || 0) > 0);

  let currentTotalValue = 0;
  const assetValues = {};
  const assetPrices = {};

  allTickers.forEach(ticker => {
    const price = resolveAssetPrice(ticker, holdings, stocks);
    const shares = holdings[ticker]?.shares || 0;
    const val = shares * price;
    assetPrices[ticker] = price;
    assetValues[ticker] = val;
    currentTotalValue += val;
  });

  const projectedTotalValue = currentTotalValue + deposit;
  const shortfalls = {};
  let totalShortfall = 0;

  allTickers.forEach(ticker => {
    const targetPct = Math.max(0, parseFloat(targets[ticker]) || 0);
    const projectedTargetVal = (projectedTotalValue * targetPct) / 100;
    const currentVal = assetValues[ticker] || 0;
    const shortfall = Math.max(0, projectedTargetVal - currentVal);
    shortfalls[ticker] = shortfall;
    totalShortfall += shortfall;
  });

  const allocatedCash = {};
  const targetSum = allTickers.reduce((acc, t) => acc + (Math.max(0, parseFloat(targets[t]) || 0)), 0) || 100;

  if (totalShortfall > 0) {
    if (deposit <= totalShortfall) {
      allTickers.forEach(ticker => {
        allocatedCash[ticker] = deposit * (shortfalls[ticker] / totalShortfall);
      });
    } else {
      // Eliminate all shortfalls first
      const surplus = deposit - totalShortfall;
      allTickers.forEach(ticker => {
        const targetPct = Math.max(0, parseFloat(targets[ticker]) || 0);
        allocatedCash[ticker] = shortfalls[ticker] + surplus * (targetPct / targetSum);
      });
    }
  } else {
    // All positions already at or above projected target: distribute by target weights
    allTickers.forEach(ticker => {
      const targetPct = Math.max(0, parseFloat(targets[ticker]) || 0);
      allocatedCash[ticker] = deposit * (targetPct / targetSum);
    });
  }

  const buyOrders = [];
  let totalBuys = 0;

  allTickers.forEach(ticker => {
    const price = assetPrices[ticker];
    const cash = allocatedCash[ticker] || 0;
    if (price <= 0 || cash <= 0) return;

    // Floor rounding ensures total spend does not exceed deposit
    const buyShares = Math.floor((cash / price) * 10000) / 10000;
    const orderTotal = buyShares * price;

    if (buyShares >= 1e-6 && orderTotal >= 0.01) {
      totalBuys += orderTotal;
      const currentVal = assetValues[ticker] || 0;
      const currentWeight = currentTotalValue > 0 ? (currentVal / currentTotalValue) * 100 : 0;
      const targetPct = Math.max(0, parseFloat(targets[ticker]) || 0);

      buyOrders.push({
        ticker,
        type: 'BUY',
        shares: buyShares,
        price,
        total: orderTotal,
        currentWeight,
        targetWeight: targetPct,
        allocatedCash: cash
      });
    }
  });

  return {
    orders: buyOrders,
    totalBuys: Math.round(totalBuys * 100) / 100,
    cashRemaining: Math.round(Math.max(0, deposit - totalBuys) * 100) / 100
  };
}
