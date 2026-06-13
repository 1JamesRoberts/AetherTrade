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

export function useWatchlist() {
  const [watchlist, setWatchlist] = useState(loadWatchlist);
  const [activeTicker, setActiveTicker] = useState(() => watchlist[0] || 'AAPL');

  useEffect(() => {
    localStorage.setItem('aethertrade_watchlist', JSON.stringify(watchlist));
  }, [watchlist]);

  const removeTicker = (ticker, addToast) => {
    const next = watchlist.filter(t => t !== ticker);
    setWatchlist(next);
    if (activeTicker === ticker) {
      setActiveTicker(next.length > 0 ? next[0] : 'AAPL');
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
