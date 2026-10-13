import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, isCloudEnabled } from '../lib/supabase.js';
import { accountKey, readStored, writeStored } from '../utils/accountStorage.js';
import { rebuildPortfolio, restorePortfolio } from '../utils/portfolioLedger.js';
import { assertResult, transactionRow, loadCloudPortfolios, replaceCloudTransactions } from '../lib/portfolioService.js';

export { rebuildPortfolioHoldings } from '../utils/portfolioLedger.js';

const newId = prefix => `${prefix}_${crypto.randomUUID()}`;
function defaultPortfolio(userId) {
  return rebuildPortfolio({ id: `default_${userId}`, name: 'Primary Portfolio', transactions: [] });
}
function loadLocalPortfolios(userId) {
  const saved = readStored(accountKey('aethertrade_portfolios_list', userId), null);
  if (!Array.isArray(saved) || !saved.length) return [defaultPortfolio(userId)];
  // Never discard an old ledger just because it needs correction.
  return saved.map(restorePortfolio);
}

export function usePortfolio(addToast, user) {
  const userId = user.id;
  const storageKey = accountKey('aethertrade_portfolios_list', userId);
  const activeKey = accountKey('aethertrade_active_portfolio_id', userId);
  const [portfolios, setPortfolios] = useState(() => loadLocalPortfolios(userId));
  const [activePortfolioId, setActivePortfolioId] = useState(() => readStored(activeKey, `default_${userId}`));
  const [dbLoaded, setDbLoaded] = useState(!isCloudEnabled);
  const stateRef = useRef(portfolios);
  const readyRef = useRef(!isCloudEnabled);
  const aliveRef = useRef(false);
  const requestRef = useRef(0);
  const writeCountRef = useRef(0);
  const queueRef = useRef(Promise.resolve());

  const commit = useCallback(next => {
    stateRef.current = next;
    if (!writeStored(storageKey, next)) addToast('Could not save data on this device. Export a CSV backup.', 'warning');
    setPortfolios(next);
  }, [storageKey, addToast]);

  const loadFromDB = useCallback(async () => {
    if (!isCloudEnabled || !aliveRef.current || writeCountRef.current) return;
    const request = ++requestRef.current;
    try {
      let next = await loadCloudPortfolios(supabase, userId);
      if (!aliveRef.current || request !== requestRef.current) return;
      if (!next.length) {
        // First login — initialize all portfolios and any owned local history atomically.
        const local = stateRef.current.map(p => rebuildPortfolio(p));
        const initial = local.map((p, index) => ({ ...p,
          id: index === 0 ? `default_${userId}` : newId('portfolio'),
          transactions: p.transactions.map(tx => ({ ...tx, id: newId('tx') }))
        }));
        assertResult(await supabase.rpc('initialize_portfolios', {
          p_portfolios: initial.map(p => ({ id: p.id, name: p.name,
            base_currency: p.baseCurrency, target_allocations: p.targetAllocations })),
          p_transactions: initial.flatMap(p => p.transactions.map(tx => transactionRow(tx, p.id)))
        }));
        next = await loadCloudPortfolios(supabase, userId);
      }
      if (!aliveRef.current || request !== requestRef.current || writeCountRef.current) return;
      if (!next.length) throw new Error('No cloud portfolio could be loaded.');
      commit(next);
      readyRef.current = true;
      setDbLoaded(true);
    } catch (error) {
      if (aliveRef.current && request === requestRef.current) {
        addToast(`Cloud sync failed; saved data was kept. ${error.message}`, 'error');
      }
    }
  }, [userId, addToast, commit]);

  // Load from Supabase and subscribe only for a real cloud client.
  useEffect(() => {
    aliveRef.current = true;
    const requests = requestRef;
    if (isCloudEnabled) void Promise.resolve().then(loadFromDB);
    const channel = isCloudEnabled ? supabase.channel(`realtime_portfolio_sync_${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => { void loadFromDB(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'portfolios', filter: `user_id=eq.${userId}` }, () => { void loadFromDB(); })
      .subscribe() : null;
    const handleOnline = () => { void loadFromDB(); };
    window.addEventListener('online', handleOnline);
    return () => {
      aliveRef.current = false;
      ++requests.current;
      if (channel) void supabase.removeChannel(channel);
      window.removeEventListener('online', handleOnline);
    };
  }, [userId, loadFromDB]);

  // Cross-tab window storage synchronization; never read another account's cache.
  useEffect(() => {
    const handleStorageChange = event => {
      if (event.key === storageKey && !writeCountRef.current) {
        const next = loadLocalPortfolios(userId);
        stateRef.current = next;
        setPortfolios(next);
      }
      if (event.key === activeKey) setActivePortfolioId(readStored(activeKey, `default_${userId}`));
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [storageKey, activeKey, userId]);

  useEffect(() => { writeStored(activeKey, activePortfolioId); }, [activeKey, activePortfolioId]);

  // Serialize writes against the latest ledger. Commit only after cloud persistence succeeds.
  const mutate = useCallback((action, operation) => {
    if (!readyRef.current) {
      addToast('Wait for cloud sync, or refresh to retry it before saving.', 'error');
      return Promise.resolve(false);
    }
    ++writeCountRef.current;
    ++requestRef.current; // Invalidate any read that started before this mutation.
    const task = queueRef.current.then(async () => {
      try {
        if (!aliveRef.current) return false;
        if (!readyRef.current) throw new Error('Wait for cloud sync, or refresh to retry it before saving.');
        const result = await operation(stateRef.current);
        if (!aliveRef.current) return false;
        commit(result.portfolios);
        if (result.activeId) setActivePortfolioId(result.activeId);
        addToast(result.message || action, 'success');
        return true;
      } catch (error) {
        if (aliveRef.current) addToast(`${action} failed. ${error.message}`, 'error');
        return false;
      } finally {
        --writeCountRef.current;
        if (!writeCountRef.current && aliveRef.current) void loadFromDB();
      }
    });
    queueRef.current = task;
    return task;
  }, [commit, addToast, loadFromDB]);

  const requirePort = (list, id) => {
    const port = list.find(p => p.id === id);
    if (!port) throw new Error('This portfolio is no longer available.');
    return port;
  };
  const replacePort = (list, port) => list.map(p => p.id === port.id ? port : p);

  const addTransaction = (id, tx) => mutate('Record transaction', async list => {
    const port = requirePort(list, id);
    const finalTx = { ...tx, id: newId('tx') };
    const next = rebuildPortfolio(port, [...port.transactions, finalTx]);
    if (isCloudEnabled) assertResult(await supabase.from('transactions').insert(transactionRow(finalTx, id)).select('id').single());
    return { portfolios: replacePort(list, next), message: `Recorded ${tx.type} transaction for ${tx.ticker}!` };
  });

  const editTransaction = (id, index, tx) => {
    // Capture a stable identity before any queued write can reorder the ledger.
    const existingId = stateRef.current.find(p => p.id === id)?.transactions[index]?.id;
    const original = stateRef.current.find(p => p.id === id)?.transactions[index];
    return mutate('Update transaction', async list => {
      const port = requirePort(list, id);
      const at = port.transactions.findIndex(t => existingId ? t.id === existingId : t === original);
      if (at < 0) throw new Error('This transaction is no longer available.');
      const finalTx = { ...port.transactions[at], ...tx, id: existingId || newId('tx') };
      const txs = [...port.transactions];
      txs[at] = finalTx;
      const next = rebuildPortfolio(port, txs);
      if (isCloudEnabled) assertResult(await supabase.from('transactions').update(transactionRow(finalTx, id))
        .eq('id', existingId).eq('portfolio_id', id).select('id').single());
      return { portfolios: replacePort(list, next), message: `Updated ${tx.type} transaction for ${tx.ticker}!` };
    });
  };

  const deleteTransaction = (id, index) => {
    const original = stateRef.current.find(p => p.id === id)?.transactions[index];
    return mutate('Delete transaction', async list => {
      const port = requirePort(list, id);
      const at = port.transactions.findIndex(t => original?.id ? t.id === original.id : t === original);
      if (at < 0) throw new Error('This transaction is no longer available.');
      const txs = port.transactions.filter((_, i) => i !== at);
      const next = rebuildPortfolio(port, txs);
      if (isCloudEnabled) assertResult(await supabase.from('transactions').delete()
        .eq('id', original.id).eq('portfolio_id', id).select('id').single());
      return { portfolios: replacePort(list, next), message: 'Transaction entry deleted and reverted.' };
    });
  };

  const resetPortfolio = id => mutate('Reset portfolio', async list => {
    const next = rebuildPortfolio(requirePort(list, id), []);
    if (isCloudEnabled) await replaceCloudTransactions(supabase, [id], []);
    return { portfolios: replacePort(list, next), message: 'Portfolio logs cleared.' };
  });

  const importCSVTransactions = (byPortfolio, isAppend) => mutate('Import CSV', async list => {
    const rows = [];
    for (const id of Object.keys(byPortfolio)) requirePort(list, id);
    const next = list.map(port => {
      if (!byPortfolio[port.id]) return port;
      const imported = byPortfolio[port.id].map(tx => ({ ...tx, id: newId('tx') }));
      rows.push(...imported.map(tx => transactionRow(tx, port.id)));
      return rebuildPortfolio(port, [...(isAppend ? port.transactions : []), ...imported]);
    });
    if (isCloudEnabled) {
      // In REPLACE mode, clear old transactions and insert replacements in one SQL transaction.
      if (!isAppend) await replaceCloudTransactions(supabase, Object.keys(byPortfolio), rows);
      else if (rows.length) assertResult(await supabase.from('transactions').insert(rows));
    }
    return { portfolios: next, message: `Imported ${rows.length} transactions!` };
  });

  const createPortfolio = name => mutate('Create portfolio', async list => {
    const cleanName = name.trim();
    if (!cleanName || list.some(p => p.name.toLowerCase() === cleanName.toLowerCase())) throw new Error('Choose a unique, non-empty portfolio name.');
    const port = rebuildPortfolio({ id: newId('portfolio'), name: cleanName, transactions: [] });
    if (isCloudEnabled) assertResult(await supabase.from('portfolios').insert({ id: port.id,
      user_id: userId, name: cleanName, base_currency: 'USD', target_allocations: {} }).select('id').single());
    return { portfolios: [...list, port], activeId: port.id, message: `Created portfolio "${cleanName}".` };
  });

  const renamePortfolio = (id, name) => mutate('Rename portfolio', async list => {
    const cleanName = name.trim();
    if (!cleanName || list.some(p => p.id !== id && p.name.toLowerCase() === cleanName.toLowerCase())) throw new Error('Choose a unique, non-empty portfolio name.');
    const port = { ...requirePort(list, id), name: cleanName };
    if (isCloudEnabled) assertResult(await supabase.from('portfolios').update({ name: cleanName }).eq('id', id).select('id').single());
    return { portfolios: replacePort(list, port), message: `Renamed portfolio to "${cleanName}".` };
  });

  const deletePortfolio = id => mutate('Delete portfolio', async list => {
    const port = requirePort(list, id);
    if (list.length <= 1) throw new Error('Keep at least one portfolio.');
    // Database cascade removes transactions atomically with the portfolio.
    if (isCloudEnabled) assertResult(await supabase.from('portfolios').delete().eq('id', id).select('id').single());
    return { portfolios: list.filter(p => p.id !== id), message: `Deleted portfolio "${port.name}".` };
  });

  const updateTargetAllocations = (id, targets) => mutate('Save target allocations', async list => {
    const port = { ...requirePort(list, id), targetAllocations: targets };
    if (isCloudEnabled) assertResult(await supabase.from('portfolios').update({ target_allocations: targets }).eq('id', id).select('id').single());
    return { portfolios: replacePort(list, port), message: 'Target allocations saved.' };
  });

  const updateBaseCurrency = (id, currency) => mutate('Save base currency', async list => {
    const safeCurr = currency === 'THB' ? 'THB' : 'USD';
    const port = { ...requirePort(list, id), baseCurrency: safeCurr };
    if (isCloudEnabled) assertResult(await supabase.from('portfolios').update({ base_currency: safeCurr }).eq('id', id).select('id').single());
    return { portfolios: replacePort(list, port), message: `Portfolio base currency set to ${safeCurr}` };
  });

  const executeRebalance = (id, trades) => mutate('Record rebalance', async list => {
    const port = requirePort(list, id);
    const now = Date.now();
    const txs = trades.map(t => ({ id: newId('tx'), ticker: t.ticker, type: t.type,
      shares: t.shares, price: t.price, fees: 0, timestamp: now, account: port.name }));
    const next = rebuildPortfolio(port, [...port.transactions, ...txs]);
    if (isCloudEnabled && txs.length) assertResult(await supabase.from('transactions').insert(txs.map(tx => transactionRow(tx, id))));
    return { portfolios: replacePort(list, next), message: `Recorded ${txs.length} rebalance orders.` };
  });

  const effectiveActivePortfolioId = portfolios.some(p => p.id === activePortfolioId)
    ? activePortfolioId : portfolios[0]?.id;
  return { portfolios, activePortfolioId: effectiveActivePortfolioId, setActivePortfolioId,
    addTransaction, editTransaction, deleteTransaction, resetPortfolio, importCSVTransactions,
    createPortfolio, renamePortfolio, deletePortfolio, updateTargetAllocations,
    updateBaseCurrency, executeRebalance, dbLoaded };
}
