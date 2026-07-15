import { useState, useEffect, useCallback, useRef } from 'react';
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
  const dbLoadedRef = useRef(false);

  // Reset first-load tracker when user logs out/in
  useEffect(() => {
    dbLoadedRef.current = false;
  }, [user]);

  const loadFromDB = useCallback(async () => {
    if (!user) { setDbLoaded(false); return; }

    const { data: dbPortfolios } = await supabase
      .from('portfolios')
      .select('*')
      .order('created_at', { ascending: true });

    const { data: dbTransactions } = await supabase
      .from('transactions')
      .select('*')
      .order('date', { ascending: true });

    const dbTransactionsWithTimestamp = (dbTransactions || []).map(tx => ({
      ...tx,
      timestamp: tx.date ? new Date(tx.date).getTime() : Date.now()
    }));

    if (dbPortfolios && dbPortfolios.length > 0) {
      const local = loadLocalPortfolios();
      const txMap = {};
      dbTransactionsWithTimestamp.forEach(tx => {
        if (!txMap[tx.portfolio_id]) txMap[tx.portfolio_id] = [];
        txMap[tx.portfolio_id].push(tx);
      });

      const merged = dbPortfolios.map(dbPort => {
        const dbTxs = txMap[dbPort.id] || [];
        // Only merge local transactions on the very first database load
        const transactions = dbLoadedRef.current
          ? dbTxs
          : (() => {
              const localPort = local.find(p => p.id === dbPort.id || (p.id === 'default' && dbPort.id === `default_${user.id}`));
              const localTxs = localPort?.transactions || [];
              return mergeTransactions(localTxs, dbTxs);
            })();
        const { holdings, realizedPL } = rebuildPortfolioHoldings(transactions);
        return { id: dbPort.id, name: dbPort.name, transactions, holdings, realizedPL };
      });

      setPortfolios(merged);
      setActivePortfolioId(prev => prev === 'default' ? `default_${user.id}` : prev);
    } else {
      // First login — create default portfolio in DB
      const local = loadLocalPortfolios();
      const uploaded = [];
      for (const port of local) {
        const dbPortId = port.id === 'default' ? `default_${user.id}` : port.id;
        const { data: newPort } = await supabase
          .from('portfolios')
          .insert({ id: dbPortId, user_id: user.id, name: port.name })
          .select()
          .single();

        const transactionsWithIds = port.transactions.map(tx => ({
          ...tx,
          id: tx.id || `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
        }));

        if (newPort && transactionsWithIds.length > 0) {
          const txs = transactionsWithIds.map(tx => ({
            id: tx.id,
            portfolio_id: dbPortId,
            ticker: tx.ticker,
            type: tx.type,
            shares: tx.shares,
            price: tx.price,
            fees: tx.fees || 0,
            date: new Date(tx.timestamp).toISOString()
          }));
          await supabase.from('transactions').insert(txs);
        }
        uploaded.push({ ...port, id: dbPortId, transactions: transactionsWithIds });
      }
      setPortfolios(uploaded);
      setActivePortfolioId(prev => prev === 'default' ? `default_${user.id}` : prev);
    }

    dbLoadedRef.current = true;
    setDbLoaded(true);
  }, [user]);

  // Load from Supabase when user logs in or hook mounts
  useEffect(() => {
    loadFromDB();
  }, [user, loadFromDB]);

  // Supabase Real-time Sync subscription
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('realtime_transactions_sync')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions'
        },
        () => {
          loadFromDB();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, loadFromDB]);

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem('aethertrade_portfolios_list', JSON.stringify(portfolios));
  }, [portfolios]);

  useEffect(() => {
    localStorage.setItem('aethertrade_active_portfolio_id', activePortfolioId);
  }, [activePortfolioId]);

  const addTransaction = useCallback(async (portfolioId, newTx) => {
    const txId = newTx.id || `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const txWithId = { ...newTx, id: txId };

    const updated = portfolios.map(p => {
      if (p.id === portfolioId) {
        const transactions = [...p.transactions, txWithId];
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
        id: txId,
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
