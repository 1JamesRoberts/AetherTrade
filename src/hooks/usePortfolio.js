import { useState, useEffect } from 'react';

function loadPortfolios() {
  try {
    const saved = localStorage.getItem('aethertrade_portfolios_list');
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error(e);
  }
  return [{ id: 'default', name: 'Primary Portfolio', holdings: {}, transactions: [], realizedPL: 0 }];
}

function loadActivePortfolioId() {
  try {
    const saved = localStorage.getItem('aethertrade_active_portfolio_id');
    if (saved && saved !== 'undefined') return saved;
  } catch (e) {
    console.error(e);
  }
  return 'default';
}

export function rebuildPortfolioHoldings(txs) {
  txs.sort((a, b) => a.timestamp - b.timestamp);
  const holdings = {};
  let realizedPL = 0;

  txs.forEach(tx => {
    const txFees = parseFloat(tx.fees) || 0;

    if (tx.type === 'BUY') {
      if (!holdings[tx.ticker]) {
        holdings[tx.ticker] = { shares: 0, avgCost: 0, totalFees: 0 };
      }
      const h = holdings[tx.ticker];
      const newCost = (h.shares * h.avgCost) + (tx.shares * tx.price);
      h.shares += tx.shares;
      h.avgCost = h.shares > 0 ? (newCost / h.shares) : 0;
      h.totalFees += txFees;
    } else {
      if (holdings[tx.ticker]) {
        const h = holdings[tx.ticker];
        realizedPL += tx.shares * (tx.price - h.avgCost) - txFees;
        const originalShares = h.shares;
        h.shares = Math.max(0, h.shares - tx.shares);
        h.totalFees = originalShares > 0 ? h.shares * (h.totalFees / originalShares) : 0;
        if (h.shares < 1e-9) delete holdings[tx.ticker];
      }
    }
  });

  return { holdings, realizedPL };
}

export function usePortfolio(addToast) {
  const [portfolios, setPortfolios] = useState(loadPortfolios);
  const [activePortfolioId, setActivePortfolioId] = useState(loadActivePortfolioId);

  useEffect(() => {
    localStorage.setItem('aethertrade_portfolios_list', JSON.stringify(portfolios));
  }, [portfolios]);

  useEffect(() => {
    localStorage.setItem('aethertrade_active_portfolio_id', activePortfolioId);
  }, [activePortfolioId]);

  const addTransaction = (portfolioId, newTx) => {
    const updated = portfolios.map(p => {
      if (p.id === portfolioId) {
        const transactions = [...p.transactions, newTx];
        const { holdings, realizedPL } = rebuildPortfolioHoldings(transactions);
        return { ...p, transactions, holdings, realizedPL };
      }
      return p;
    });
    setPortfolios(updated);
    addToast(`Recorded ${newTx.type} transaction for ${newTx.ticker}!`, 'success');
  };

  const deleteTransaction = (portfolioId, index) => {
    const updated = portfolios.map(p => {
      if (p.id === portfolioId) {
        const transactions = [...p.transactions];
        transactions.splice(index, 1);
        const { holdings, realizedPL } = rebuildPortfolioHoldings(transactions);
        return { ...p, transactions, holdings, realizedPL };
      }
      return p;
    });
    setPortfolios(updated);
    addToast("Transaction entry deleted and reverted.", "warning");
  };

  const resetPortfolio = (portfolioId) => {
    const updated = portfolios.map(p => {
      if (p.id === portfolioId) {
        return { ...p, transactions: [], holdings: {}, realizedPL: 0 };
      }
      return p;
    });
    setPortfolios(updated);
    addToast("Portfolio liquidated and logs cleared.", "info");
  };

  return {
    portfolios,
    setPortfolios,
    activePortfolioId,
    setActivePortfolioId,
    addTransaction,
    deleteTransaction,
    resetPortfolio
  };
}
