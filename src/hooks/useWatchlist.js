import { useState, useEffect } from 'react';
import { useSyncedRecord } from './useSyncedRecord.js';
import { accountKey, readStored, writeStored } from '../utils/accountStorage.js';

const DEFAULT_WATCHLIST = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'GOOG', 'AMZN'];

export function useWatchlist(user, addToast) {
  const [watchlist, setWatchlist] = useSyncedRecord(user, 'watchlists', 'tickers',
    'aethertrade_watchlist', DEFAULT_WATCHLIST, addToast);
  const activeKey = accountKey('aethertrade_active_ticker', user.id);
  const [selectedTicker, selectTicker] = useState(() => readStored(activeKey, null));
  // Cloud/storage updates must apply the same active-asset fallback as local removals.
  const activeTicker = watchlist.includes(selectedTicker) ? selectedTicker : (watchlist[0] || 'AAPL');
  // Reconcile selection so a later cloud re-add does not resurrect a removed selection.
  if (selectedTicker !== activeTicker) selectTicker(activeTicker);
  const setActiveTicker = ticker => { selectTicker(ticker); };
  useEffect(() => { writeStored(activeKey, activeTicker); }, [activeKey, activeTicker]);

  const removeTicker = async ticker => {
    const saved = await setWatchlist(prev => prev.filter(t => t !== ticker));
    if (saved) addToast(`Removed ${ticker} from watchlist.`, 'info');
    return saved;
  };
  const addTicker = async ticker => {
    const saved = await setWatchlist(prev => prev.includes(ticker) ? prev : [...prev, ticker]);
    if (saved) {
      selectTicker(ticker);
      addToast(`Added ${ticker} to watchlist!`, 'success');
    }
    return saved;
  };
  return { watchlist, activeTicker, setActiveTicker, removeTicker, addTicker };
}
