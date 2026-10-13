import { detectTickerCurrency, convertCurrency } from './currencyUtils.js';

export function sortTransactions(transactions) {
  // Stable ordering preserves the user's entry order for trades on the same day.
  return [...transactions].sort((a, b) => (a.timestamp - b.timestamp) ||
    ((a.ledger_order ?? Number.MAX_SAFE_INTEGER) - (b.ledger_order ?? Number.MAX_SAFE_INTEGER)));
}

export function validateLedger(transactions) {
  const balances = new Map();
  for (const tx of sortTransactions(transactions)) {
    if (!tx.ticker || !['BUY', 'SELL', 'DIVIDEND'].includes(tx.type) ||
      !Number.isFinite(Number(tx.timestamp)) ||
      !Number.isFinite(Number(tx.shares)) || Number(tx.shares) <= 0 ||
      !Number.isFinite(Number(tx.price)) || Number(tx.price) < 0 ||
      (tx.type !== 'DIVIDEND' && Number(tx.price) <= 0) ||
      !Number.isFinite(Number(tx.fees ?? 0)) || Number(tx.fees ?? 0) < 0) {
      throw new Error('Each transaction needs a valid symbol, date, type, quantity, price, and fee.');
    }
    const owned = balances.get(tx.ticker) || 0;
    if (tx.type === 'SELL' && (owned <= 0 || Number(tx.shares) > owned + 1e-9)) {
      throw new Error(`On ${new Date(tx.timestamp).toLocaleDateString()}, the sale of ${tx.shares} ${tx.ticker} exceeds the ${owned} shares held. Check earlier purchases and sales.`);
    }
    if (tx.type === 'BUY') balances.set(tx.ticker, owned + Number(tx.shares));
    if (tx.type === 'SELL') {
      const remaining = Math.max(0, owned - Number(tx.shares));
      balances.set(tx.ticker, remaining < 1e-9 ? 0 : remaining);
    }
  }
}

export function rebuildPortfolioHoldings(txs) {
  validateLedger(txs);
  const holdings = Object.create(null);
  let realizedPL = 0;
  const realizedPLByCurrency = { USD: 0, THB: 0 };
  let totalDividends = 0;
  const dividendsByCurrency = { USD: 0, THB: 0 };
  const dividendsByTicker = Object.create(null);

  sortTransactions(txs).forEach(tx => {
    const txFees = Number(tx.fees) || 0;
    const txShares = Number(tx.shares);
    const txPrice = Number(tx.price);
    const curr = detectTickerCurrency(tx.ticker);
    if (tx.type === 'BUY') {
      if (!holdings[tx.ticker]) {
        holdings[tx.ticker] = { shares: 0, avgCost: 0, totalFees: 0,
          totalDividends: dividendsByTicker[tx.ticker] || 0, currency: curr };
      }
      const h = holdings[tx.ticker];
      const newCost = h.shares * h.avgCost + txShares * txPrice;
      h.shares += txShares;
      h.avgCost = newCost / h.shares;
      h.totalFees += txFees;
    } else if (tx.type === 'SELL') {
      const h = holdings[tx.ticker];
      const originalShares = h.shares;
      const soldShares = Math.min(originalShares, txShares); // Floating point tolerance only; validated above.
      const proportionalBuyFee = soldShares / originalShares * h.totalFees;
      const gain = soldShares * (txPrice - h.avgCost) - txFees - proportionalBuyFee;
      realizedPL += gain;
      realizedPLByCurrency[curr] += gain;
      h.shares = Math.max(0, originalShares - soldShares);
      h.totalFees *= h.shares / originalShares;
      if (h.shares < 1e-9) delete holdings[tx.ticker];
    } else if (tx.type === 'DIVIDEND') {
      // Net Dividend Formula; retain orphan dividends after positions are sold.
      const netDividend = Math.max(0, txShares * txPrice - txFees);
      totalDividends += netDividend;
      dividendsByCurrency[curr] += netDividend;
      dividendsByTicker[tx.ticker] = (dividendsByTicker[tx.ticker] || 0) + netDividend;
      if (holdings[tx.ticker]) holdings[tx.ticker].totalDividends += netDividend;
    }
  });
  return { holdings, realizedPL, realizedPLByCurrency, totalDividends, dividendsByCurrency, dividendsByTicker };
}

export function rebuildPortfolio(portfolio, transactions = portfolio.transactions || []) {
  const sorted = sortTransactions(transactions);
  return { ...portfolio, ledgerError: null, baseCurrency: portfolio.baseCurrency || 'USD',
    targetAllocations: portfolio.targetAllocations || {}, transactions: sorted,
    ...rebuildPortfolioHoldings(sorted) };
}

/** Preserve old invalid ledgers for repair; do not invent holdings or erase their rows. */
export function restorePortfolio(portfolio) {
  try { return rebuildPortfolio(portfolio); }
  catch (error) {
    return { ...rebuildPortfolio({ ...portfolio, transactions: [] }),
      transactions: sortTransactions(portfolio.transactions || []), ledgerError: error.message };
  }
}

export function dividendGross(transaction) {
  return Number(transaction.shares) * Number(transaction.price);
}

/** Simple cumulative return on gross purchase cost, including all closed positions. */
export function investedCapital(transactions, baseCurrency, fxRate) {
  return transactions.reduce((total, tx) => tx.type === 'BUY'
    ? total + convertCurrency(Number(tx.shares) * Number(tx.price) + Number(tx.fees || 0),
      detectTickerCurrency(tx.ticker), baseCurrency, fxRate) : total, 0);
}
