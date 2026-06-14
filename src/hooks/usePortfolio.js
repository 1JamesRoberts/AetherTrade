import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

function loadLocalPortfolios() {
  try {
    const saved = localStorage.getItem('aethertrade_portfolios_list');
    if (saved) return JSON.parse(saved);
  } catch (e) { console.error(e); }
  return [{ id: 'default', name: 'Primary Portfolio', holdings: {}, transactions: [], realizedPL: 0 }];
}

function loadLocalActiveId() {
  try {
    const saved = localStorage.getItem('aethertrade_active_portfolio_id');
    if (saved && saved !== 'undefined') return saved;
  } catch (e) { console.error(e); }
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

function mergeTransactions(localTxs, dbTxs) {
  const seen = new Set(dbTxs.map(t => t.id));
  const merged = [...dbTxs];
  localTxs.forEach(tx => {
    if (!seen.has(tx.id)) merged.push(tx);
  });
  merged.sort((a, b) => a.timestamp - b.timestamp);
  return merged;
}

export function usePortfolio(addToast, user) {
  const [portfolios, setPortfolios] = useState(loadLocalPortfolios);
  const [activePortfolioId, setActivePortfolioId] = useState(loadLocalActiveId);
  const [dbLoaded, setDbLoaded] = useState(false);

  // Load from Supabase when user logs in
  useEffect(() => {
    if (!user) { setDbLoaded(false); return; }

    async function loadFromDB() {
      const { data: dbPortfolios } = await supabase
        .from('portfolios')
        .select('*')
        .order('created_at', { ascending: true });

      const { data: dbTransactions } = await supabase
        .from('transactions')
        .select('*')
        .order('date', { ascending: true });

      if (dbPortfolios && dbPortfolios.length > 0) {
        const local = loadLocalPortfolios();
        const txMap = {};
        (dbTransactions || []).forEach(tx => {
          if (!txMap[tx.portfolio_id]) txMap[tx.portfolio_id] = [];
          txMap[tx.portfolio_id].push(tx);
        });

        const merged = dbPortfolios.map(dbPort => {
          const dbTxs = txMap[dbPort.id] || [];
          const localPort = local.find(p => p.id === dbPort.id);
          const localTxs = localPort?.transactions || [];
          const transactions = mergeTransactions(localTxs, dbTxs);
          const { holdings, realizedPL } = rebuildPortfolioHoldings(transactions);
          return { id: dbPort.id, name: dbPort.name, transactions, holdings, realizedPL };
        });

        setPortfolios(merged);
      } else {
        // First login — create default portfolio in DB
        const local = loadLocalPortfolios();
        for (const port of local) {
          const { data: newPort } = await supabase
            .from('portfolios')
            .insert({ id: port.id, user_id: user.id, name: port.name })
            .select()
            .single();

          if (newPort && port.transactions.length > 0) {
            const txs = port.transactions.map(tx => ({
              id: tx.id,
              portfolio_id: port.id,
              ticker: tx.ticker,
              type: tx.type,
              shares: tx.shares,
              price: tx.price,
              fees: tx.fees || 0,
              date: new Date(tx.timestamp).toISOString()
            }));
            await supabase.from('transactions').insert(txs);
          }
        }
        setPortfolios(local);
      }

      setDbLoaded(true);
    }

    loadFromDB();
  }, [user]);

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem('aethertrade_portfolios_list', JSON.stringify(portfolios));
  }, [portfolios]);

  useEffect(() => {
    localStorage.setItem('aethertrade_active_portfolio_id', activePortfolioId);
  }, [activePortfolioId]);

  const addTransaction = useCallback(async (portfolioId, newTx) => {
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

    // Persist to Supabase
    if (user) {
      const { error } = await supabase.from('transactions').insert({
        id: newTx.id,
        portfolio_id: portfolioId,
        ticker: newTx.ticker,
        type: newTx.type,
        shares: newTx.shares,
        price: newTx.price,
        fees: newTx.fees || 0,
        date: new Date(newTx.timestamp).toISOString()
      });
      if (error) console.error('Supabase insert error:', error);
    }
  }, [portfolios, user, addToast]);

  const deleteTransaction = useCallback(async (portfolioId, index) => {
    let deletedTxId = null;
    const updated = portfolios.map(p => {
      if (p.id === portfolioId) {
        const transactions = [...p.transactions];
        deletedTxId = transactions[index]?.id;
        transactions.splice(index, 1);
        const { holdings, realizedPL } = rebuildPortfolioHoldings(transactions);
        return { ...p, transactions, holdings, realizedPL };
      }
      return p;
    });
    setPortfolios(updated);
    addToast("Transaction entry deleted and reverted.", "warning");

    if (user && deletedTxId) {
      const { error } = await supabase.from('transactions').delete().eq('id', deletedTxId);
      if (error) console.error('Supabase delete error:', error);
    }
  }, [portfolios, user, addToast]);

  const resetPortfolio = useCallback(async (portfolioId) => {
    const updated = portfolios.map(p => {
      if (p.id === portfolioId) {
        return { ...p, transactions: [], holdings: {}, realizedPL: 0 };
      }
      return p;
    });
    setPortfolios(updated);
    addToast("Portfolio liquidated and logs cleared.", "info");

    if (user) {
      const { error } = await supabase.from('transactions').delete().eq('portfolio_id', portfolioId);
      if (error) console.error('Supabase reset error:', error);
    }
  }, [portfolios, user, addToast]);

  return {
    portfolios,
    setPortfolios,
    activePortfolioId,
    setActivePortfolioId,
    addTransaction,
    deleteTransaction,
    resetPortfolio,
    dbLoaded
  };
}
