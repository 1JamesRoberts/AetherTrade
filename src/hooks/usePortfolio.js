import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { detectTickerCurrency } from '../utils/currencyUtils';

function loadLocalTargetAllocations() {
  try {
    const saved = localStorage.getItem('aethertrade_target_allocations');
    if (saved) return JSON.parse(saved);
  } catch (e) { console.error('Error loading target allocations:', e); }
  return {};
}

function saveLocalTargetAllocations(targetMap) {
  try {
    localStorage.setItem('aethertrade_target_allocations', JSON.stringify(targetMap));
  } catch (e) { console.error('Error saving target allocations:', e); }
}

function loadLocalBaseCurrencies() {
  try {
    const saved = localStorage.getItem('aethertrade_base_currencies');
    if (saved) return JSON.parse(saved);
  } catch (e) { console.error('Error loading base currencies:', e); }
  return {};
}

function saveLocalBaseCurrencies(currMap) {
  try {
    localStorage.setItem('aethertrade_base_currencies', JSON.stringify(currMap));
  } catch (e) { console.error('Error saving base currencies:', e); }
}

function loadLocalPortfolios() {
  const targetMap = loadLocalTargetAllocations();
  const currMap = loadLocalBaseCurrencies();
  try {
    const saved = localStorage.getItem('aethertrade_portfolios_list');
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed.map(p => ({
        ...p,
        baseCurrency: p.baseCurrency || currMap[p.id] || 'USD',
        targetAllocations: p.targetAllocations || targetMap[p.id] || {}
      }));
    }
  } catch (e) { console.error(e); }
  return [{
    id: 'default',
    name: 'Primary Portfolio',
    holdings: {},
    transactions: [],
    realizedPL: 0,
    realizedPLByCurrency: { USD: 0, THB: 0 },
    baseCurrency: currMap['default'] || 'USD',
    targetAllocations: targetMap['default'] || {}
  }];
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
  const realizedPLByCurrency = { USD: 0, THB: 0 };

  txs.forEach(tx => {
    const txFees = parseFloat(tx.fees) || 0;
    const txShares = parseFloat(tx.shares) || 0;
    const txPrice = parseFloat(tx.price) || 0;
    const curr = detectTickerCurrency(tx.ticker);

    if (tx.type === 'BUY') {
      if (!holdings[tx.ticker]) {
        holdings[tx.ticker] = { shares: 0, avgCost: 0, totalFees: 0, currency: curr };
      }
      const h = holdings[tx.ticker];
      const newCost = (h.shares * h.avgCost) + (txShares * txPrice);
      h.shares += txShares;
      h.avgCost = h.shares > 0 ? (newCost / h.shares) : 0;
      h.totalFees += txFees;
    } else {
      if (holdings[tx.ticker]) {
        const h = holdings[tx.ticker];
        const originalShares = h.shares;
        const soldShares = Math.min(originalShares, txShares);
        const proportionalBuyFee = originalShares > 0 ? (soldShares / originalShares) * (h.totalFees || 0) : 0;
        
        const gain = soldShares * (txPrice - h.avgCost) - txFees - proportionalBuyFee;
        realizedPL += gain;
        realizedPLByCurrency[curr] = (realizedPLByCurrency[curr] || 0) + gain;

        h.shares = Math.max(0, h.shares - soldShares);
        h.totalFees = originalShares > 0 ? (h.totalFees || 0) * (h.shares / originalShares) : 0;
        if (h.shares < 1e-9) delete holdings[tx.ticker];
      }
    }
  });

  return { holdings, realizedPL, realizedPLByCurrency };
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
      const txMap = {};
      dbTransactionsWithTimestamp.forEach(tx => {
        if (!txMap[tx.portfolio_id]) txMap[tx.portfolio_id] = [];
        txMap[tx.portfolio_id].push(tx);
      });

      const targetMap = loadLocalTargetAllocations();
      const currMap = loadLocalBaseCurrencies();
      const merged = dbPortfolios.map(dbPort => {
        const dbTxs = txMap[dbPort.id] || [];
        const { holdings, realizedPL, realizedPLByCurrency } = rebuildPortfolioHoldings(dbTxs);
        return {
          id: dbPort.id,
          name: dbPort.name,
          transactions: dbTxs,
          holdings,
          realizedPL,
          realizedPLByCurrency,
          baseCurrency: currMap[dbPort.id] || dbPort.base_currency || 'USD',
          targetAllocations: targetMap[dbPort.id] || dbPort.target_allocations || {}
        };
      });

      setPortfolios(merged);
      try {
        localStorage.setItem('aethertrade_portfolios_list', JSON.stringify(merged));
      } catch (e) { console.error('LocalStorage update error:', e); }
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
    let isCancelled = false;
    if (user) {
      const initLoad = async () => {
        if (!isCancelled) {
          await loadFromDB();
        }
      };
      initLoad();
    }
    return () => {
      isCancelled = true;
    };
  }, [user, loadFromDB]);

  // Supabase Real-time Sync subscription for transactions and portfolios
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('realtime_portfolio_sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions' },
        () => { loadFromDB(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'portfolios' },
        () => { loadFromDB(); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, loadFromDB]);

  // Cross-tab window storage synchronization
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'aethertrade_portfolios_list' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          setPortfolios(parsed);
        } catch (err) {
          console.error('Cross-tab storage sync error:', err);
        }
      }
      if (e.key === 'aethertrade_target_allocations' && e.newValue) {
        try {
          const targetMap = JSON.parse(e.newValue);
          setPortfolios(prev => prev.map(p => ({
            ...p,
            targetAllocations: targetMap[p.id] || p.targetAllocations || {}
          })));
        } catch (err) {
          console.error('Cross-tab target allocations sync error:', err);
        }
      }
      if (e.key === 'aethertrade_active_portfolio_id' && e.newValue) {
        setActivePortfolioId(e.newValue);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem('aethertrade_portfolios_list', JSON.stringify(portfolios));
  }, [portfolios]);

  useEffect(() => {
    localStorage.setItem('aethertrade_active_portfolio_id', activePortfolioId);
  }, [activePortfolioId]);

  // Keep activePortfolioId valid
  const effectiveActivePortfolioId = portfolios.some(p => p.id === activePortfolioId)
    ? activePortfolioId
    : (portfolios[0]?.id || 'default');

  const addTransaction = useCallback(async (portfolioId, newTx) => {
    const txId = newTx.id || `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const txWithId = { ...newTx, id: txId };

    // Resolve target portfolio ID: match requested portfolioId, fallback to activePortfolioId or first available portfolio
    let targetPortId = portfolioId;
    if (!portfolios.some(p => p.id === targetPortId)) {
      if (portfolios.some(p => p.id === activePortfolioId)) {
        targetPortId = activePortfolioId;
      } else if (portfolios.length > 0) {
        targetPortId = portfolios[0].id;
      }
    }

    if (portfolios.length === 0) {
      targetPortId = 'default';
      const { holdings, realizedPL } = rebuildPortfolioHoldings([txWithId]);
      const newPort = {
        id: targetPortId,
        name: 'Primary Portfolio',
        transactions: [txWithId],
        holdings,
        realizedPL
      };
      setPortfolios([newPort]);
      setActivePortfolioId(targetPortId);
    } else {
      const updated = portfolios.map(p => {
        if (p.id === targetPortId) {
          const transactions = [...p.transactions, txWithId];
          const { holdings, realizedPL } = rebuildPortfolioHoldings(transactions);
          return { ...p, transactions, holdings, realizedPL };
        }
        return p;
      });
      setPortfolios(updated);
    }

    addToast(`Recorded ${newTx.type} transaction for ${newTx.ticker}!`, 'success');

    // Persist to Supabase
    if (user) {
      const { error } = await supabase.from('transactions').insert({
        id: txId,
        portfolio_id: targetPortId,
        ticker: newTx.ticker,
        type: newTx.type,
        shares: newTx.shares,
        price: newTx.price,
        fees: newTx.fees || 0,
        date: new Date(newTx.timestamp).toISOString()
      });
      if (error) console.error('Supabase insert error:', error);
    }
  }, [portfolios, activePortfolioId, user, addToast]);

  const deleteTransaction = useCallback(async (portfolioId, index) => {
    let targetPortId = portfolioId;
    if (!portfolios.some(p => p.id === targetPortId)) {
      targetPortId = activePortfolioId;
    }

    let deletedTxId = null;
    const updated = portfolios.map(p => {
      if (p.id === targetPortId) {
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
  }, [portfolios, activePortfolioId, user, addToast]);

  const editTransaction = useCallback(async (portfolioId, index, updatedTx) => {
    let targetPortId = portfolioId;
    if (!portfolios.some(p => p.id === targetPortId)) {
      targetPortId = activePortfolioId;
    }

    let existingTxId = null;
    let finalTx = null;

    setPortfolios(prev => prev.map(p => {
      if (p.id === targetPortId) {
        const transactions = [...p.transactions];
        existingTxId = transactions[index]?.id || `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        finalTx = {
          ...updatedTx,
          id: existingTxId,
          portfolio_id: targetPortId
        };
        transactions[index] = finalTx;
        // Re-sort chronologically by timestamp
        transactions.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        const { holdings, realizedPL } = rebuildPortfolioHoldings(transactions);
        return { ...p, transactions, holdings, realizedPL };
      }
      return p;
    }));

    addToast(`Updated ${updatedTx.type} transaction for ${updatedTx.ticker}!`, 'success');

    if (user && existingTxId && finalTx) {
      const { error } = await supabase.from('transactions').upsert({
        id: existingTxId,
        portfolio_id: targetPortId,
        ticker: finalTx.ticker,
        type: finalTx.type,
        shares: finalTx.shares,
        price: finalTx.price,
        fees: finalTx.fees || 0,
        date: new Date(finalTx.timestamp).toISOString()
      });
      if (error) console.error('Supabase edit transaction error:', error);
    }
  }, [portfolios, activePortfolioId, user, addToast]);

  const resetPortfolio = useCallback(async (portfolioId) => {
    let targetPortId = portfolioId;
    if (!portfolios.some(p => p.id === targetPortId)) {
      targetPortId = activePortfolioId;
    }

    const updated = portfolios.map(p => {
      if (p.id === targetPortId) {
        return { ...p, transactions: [], holdings: {}, realizedPL: 0 };
      }
      return p;
    });
    setPortfolios(updated);
    addToast("Portfolio liquidated and logs cleared.", "info");

    if (user) {
      const { error } = await supabase.from('transactions').delete().eq('portfolio_id', targetPortId);
      if (error) console.error('Supabase reset error:', error);
    }
  }, [portfolios, activePortfolioId, user, addToast]);

  const importCSVTransactions = useCallback(async (txsByPortfolio, isAppend) => {
    const allInsertedTxs = [];

    const updated = portfolios.map(port => {
      const imported = txsByPortfolio[port.id];
      if (!imported) return port;

      const importedWithIds = imported.map(tx => ({
        ...tx,
        id: tx.id || `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}_${Math.random().toString(36).substring(2, 6)}`
      }));

      allInsertedTxs.push(...importedWithIds.map(tx => ({ ...tx, portfolio_id: port.id })));

      const existing = isAppend ? port.transactions : [];
      const combined = [...existing, ...importedWithIds].sort((a, b) => a.timestamp - b.timestamp);
      const { holdings, realizedPL } = rebuildPortfolioHoldings(combined);
      return { ...port, transactions: combined, holdings, realizedPL };
    });

    setPortfolios(updated);

    // Synchronize to Supabase database if logged in
    if (user) {
      for (const portId of Object.keys(txsByPortfolio)) {
        if (!isAppend) {
          // In REPLACE mode, clear old transactions for this portfolio in Supabase
          const { error: delErr } = await supabase.from('transactions').delete().eq('portfolio_id', portId);
          if (delErr) console.error('Supabase CSV replace delete error:', delErr);
        }
      }

      if (allInsertedTxs.length > 0) {
        const dbRows = allInsertedTxs.map(tx => ({
          id: tx.id,
          portfolio_id: tx.portfolio_id,
          ticker: tx.ticker,
          type: tx.type,
          shares: tx.shares,
          price: tx.price,
          fees: tx.fees || 0,
          date: new Date(tx.timestamp).toISOString()
        }));

        const { error: insErr } = await supabase.from('transactions').insert(dbRows);
        if (insErr) console.error('Supabase batch CSV insert error:', insErr);
      }
    }

    return updated;
  }, [portfolios, user]);

  const createPortfolio = useCallback(async (name) => {
    const cleanName = name.trim();
    if (portfolios.some(p => p.name.toLowerCase() === cleanName.toLowerCase())) {
      addToast(`A portfolio named "${cleanName}" already exists!`, 'error');
      return false;
    }

    const newId = 'portfolio_' + Date.now();
    const newPort = {
      id: newId,
      name: cleanName,
      holdings: {},
      transactions: [],
      realizedPL: 0
    };

    const updated = [...portfolios, newPort];
    setPortfolios(updated);
    setActivePortfolioId(newId);
    addToast(`Created portfolio "${cleanName}" successfully!`, 'success');

    if (user) {
      const { error } = await supabase.from('portfolios').insert({
        id: newId,
        user_id: user.id,
        name: cleanName
      });
      if (error) console.error('Supabase create portfolio error:', error);
    }
    return true;
  }, [portfolios, user, addToast]);

  const renamePortfolio = useCallback(async (portfolioId, newName) => {
    const cleanName = newName.trim();
    if (portfolios.some(p => p.id !== portfolioId && p.name.toLowerCase() === cleanName.toLowerCase())) {
      addToast(`A portfolio named "${cleanName}" already exists!`, 'error');
      return false;
    }

    const updated = portfolios.map(p => {
      if (p.id === portfolioId) return { ...p, name: cleanName };
      return p;
    });
    setPortfolios(updated);
    addToast(`Renamed portfolio to "${cleanName}" successfully!`, 'success');

    if (user) {
      const { error } = await supabase.from('portfolios').update({ name: cleanName }).eq('id', portfolioId);
      if (error) console.error('Supabase rename portfolio error:', error);
    }
    return true;
  }, [portfolios, user, addToast]);

  const deletePortfolio = useCallback(async (portfolioId) => {
    if (portfolios.length <= 1) {
      addToast("You must keep at least one portfolio!", "error");
      return false;
    }

    const deletedPort = portfolios.find(p => p.id === portfolioId);
    const remaining = portfolios.filter(p => p.id !== portfolioId);
    setPortfolios(remaining);
    if (activePortfolioId === portfolioId) {
      setActivePortfolioId(remaining[0].id);
    }

    // Prune target allocations for deleted portfolio
    const targetMap = loadLocalTargetAllocations();
    if (targetMap[portfolioId]) {
      delete targetMap[portfolioId];
      saveLocalTargetAllocations(targetMap);
    }

    addToast(`Deleted portfolio "${deletedPort?.name || ''}" successfully.`, "success");

    if (user) {
      const { error: txErr } = await supabase.from('transactions').delete().eq('portfolio_id', portfolioId);
      if (txErr) console.error('Supabase delete portfolio transactions error:', txErr);

      const { error: portErr } = await supabase.from('portfolios').delete().eq('id', portfolioId);
      if (portErr) console.error('Supabase delete portfolio error:', portErr);
    }
    return true;
  }, [portfolios, activePortfolioId, user, addToast]);

  const updateTargetAllocations = useCallback((portfolioId, newTargets) => {
    let targetPortId = portfolioId;
    if (!portfolios.some(p => p.id === targetPortId)) {
      targetPortId = activePortfolioId;
    }

    // 1. Update state
    setPortfolios(prev => prev.map(p => {
      if (p.id === targetPortId) {
        return { ...p, targetAllocations: newTargets };
      }
      return p;
    }));

    // 2. Persist to dedicated localStorage key
    const targetMap = loadLocalTargetAllocations();
    targetMap[targetPortId] = newTargets;
    saveLocalTargetAllocations(targetMap);
  }, [portfolios, activePortfolioId]);

  const updateBaseCurrency = useCallback((portfolioId, currency) => {
    const safeCurr = currency === 'THB' ? 'THB' : 'USD';
    let targetPortId = portfolioId;
    if (!portfolios.some(p => p.id === targetPortId)) {
      targetPortId = activePortfolioId;
    }

    // 1. Update state
    setPortfolios(prev => prev.map(p => {
      if (p.id === targetPortId) {
        return { ...p, baseCurrency: safeCurr };
      }
      return p;
    }));

    // 2. Persist to localStorage
    const currMap = loadLocalBaseCurrencies();
    currMap[targetPortId] = safeCurr;
    saveLocalBaseCurrencies(currMap);

    addToast(`Portfolio base currency set to ${safeCurr}`, 'info');
  }, [portfolios, activePortfolioId, addToast]);

  const executeRebalance = useCallback(async (portfolioId, trades) => {
    if (!trades || trades.length === 0) return;

    let targetPortId = portfolioId;
    const targetPort = portfolios.find(p => p.id === targetPortId) || portfolios.find(p => p.id === activePortfolioId) || portfolios[0];
    if (targetPort) targetPortId = targetPort.id;
    const accountName = targetPort?.name || 'Default';

    const now = Date.now();
    const newTxs = trades.map((t, idx) => ({
      id: `tx_reb_${now}_${idx}_${Math.random().toString(36).substring(2, 7)}`,
      portfolio_id: targetPortId,
      ticker: t.ticker,
      type: t.type,
      shares: t.shares,
      price: t.price,
      fees: 0,
      timestamp: now + idx * 10,
      account: accountName
    }));

    // 1. Atomic functional state update
    setPortfolios(prev => prev.map(p => {
      if (p.id === targetPortId) {
        const combined = [...p.transactions, ...newTxs];
        const { holdings, realizedPL, realizedPLByCurrency } = rebuildPortfolioHoldings(combined);
        return { ...p, transactions: combined, holdings, realizedPL, realizedPLByCurrency };
      }
      return p;
    }));

    addToast(`Executed ${trades.length} rebalance order${trades.length === 1 ? '' : 's'} successfully!`, 'success');

    // 2. Batch insert to Supabase if logged in
    if (user) {
      const dbRows = newTxs.map(tx => ({
        id: tx.id,
        portfolio_id: targetPortId,
        ticker: tx.ticker,
        type: tx.type,
        shares: tx.shares,
        price: tx.price,
        fees: 0,
        date: new Date(tx.timestamp).toISOString()
      }));

      const { error } = await supabase.from('transactions').insert(dbRows);
      if (error) console.error('Supabase batch rebalance insert error:', error);
    }
  }, [portfolios, activePortfolioId, user, addToast]);

  return {
    portfolios,
    setPortfolios,
    activePortfolioId: effectiveActivePortfolioId,
    setActivePortfolioId,
    addTransaction,
    editTransaction,
    deleteTransaction,
    resetPortfolio,
    importCSVTransactions,
    createPortfolio,
    renamePortfolio,
    deletePortfolio,
    updateTargetAllocations,
    updateBaseCurrency,
    executeRebalance,
    dbLoaded
  };
}
