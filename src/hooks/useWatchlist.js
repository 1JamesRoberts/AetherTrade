import { useState, useEffect } from 'react';

const DEFAULT_WATCHLIST = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'GOOG', 'AMZN'];

function loadWatchlist() {
  try {
    const saved = localStorage.getItem('aethertrade_watchlist');
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error(e);
  }
  return DEFAULT_WATCHLIST;
}

function loadActiveTicker(watchlist) {
  try {
    const saved = localStorage.getItem('aethertrade_active_ticker');
    if (saved && (watchlist.length === 0 || watchlist.includes(saved))) {
      return saved;
    }
  } catch (e) {
    console.error(e);
  }
  return watchlist[0] || 'AAPL';
}

export function useWatchlist() {
  const [watchlist, setWatchlist] = useState(loadWatchlist);
  const [activeTicker, setActiveTicker] = useState(() => loadActiveTicker(watchlist));

  useEffect(() => {
    localStorage.setItem('aethertrade_watchlist', JSON.stringify(watchlist));
  }, [watchlist]);

  useEffect(() => {
    if (activeTicker) {
      localStorage.setItem('aethertrade_active_ticker', activeTicker);
    }
  }, [activeTicker]);

  const removeTicker = (ticker, addToast) => {
    const next = watchlist.filter(t => t !== ticker);
    setWatchlist(next);
    if (activeTicker === ticker) {
      const fallback = next.length > 0 ? next[0] : 'AAPL';
      setActiveTicker(fallback);
      localStorage.setItem('aethertrade_active_ticker', fallback);
    }
    addToast(`Removed ${ticker} from watchlist.`, 'info');
  };

  const addTicker = (ticker, addToast) => {
    if (!watchlist.includes(ticker)) {
      setWatchlist([...watchlist, ticker]);
    }
    setActiveTicker(ticker);
    addToast(`Added ${ticker} to watchlist!`, 'success');
  };

  return { watchlist, setWatchlist, activeTicker, setActiveTicker, removeTicker, addTicker };
}
