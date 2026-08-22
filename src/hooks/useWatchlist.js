import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

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

export function useWatchlist(user) {
  const [watchlist, setWatchlist] = useState(loadWatchlist);
  const [activeTicker, setActiveTicker] = useState(() => loadActiveTicker(watchlist));
  const watchlistRef = useRef(watchlist);
  useEffect(() => { watchlistRef.current = watchlist; }, [watchlist]);

  // Load watchlist from Supabase when user logs in
  const loadCloudWatchlist = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('watchlists')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Supabase load watchlist error:', error);
      }

      if (data && Array.isArray(data.tickers) && data.tickers.length > 0) {
        setWatchlist(data.tickers);
        localStorage.setItem('aethertrade_watchlist', JSON.stringify(data.tickers));
      } else if (!data) {
        // Initial sync to cloud for new user: upload current watchlist
        const currentList = watchlistRef.current && watchlistRef.current.length > 0 ? watchlistRef.current : DEFAULT_WATCHLIST;
        const { error: upsertErr } = await supabase.from('watchlists').upsert({
          user_id: user.id,
          tickers: currentList,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
        if (upsertErr) console.error('Supabase initial watchlist upsert error:', upsertErr);
      }
    } catch (err) {
      console.warn('Watchlist cloud sync skipped/failed:', err);
    }
  }, [user]);

  useEffect(() => {
    loadCloudWatchlist();
  }, [user, loadCloudWatchlist]);

  // Real-time live sync for watchlist changes across devices/tabs
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`realtime_watchlist_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'watchlists',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          if (payload?.new && Array.isArray(payload.new.tickers) && payload.new.tickers.length > 0) {
            setWatchlist(payload.new.tickers);
            localStorage.setItem('aethertrade_watchlist', JSON.stringify(payload.new.tickers));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // LocalStorage persistence
  useEffect(() => {
    localStorage.setItem('aethertrade_watchlist', JSON.stringify(watchlist));
  }, [watchlist]);

  useEffect(() => {
    if (activeTicker) {
      localStorage.setItem('aethertrade_active_ticker', activeTicker);
    }
  }, [activeTicker]);

  const syncToCloud = async (newList) => {
    if (!user) return;
    try {
      const { error } = await supabase.from('watchlists').upsert({
        user_id: user.id,
        tickers: newList,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });
      if (error) console.error('Supabase watchlist update error:', error);
    } catch (err) {
      console.error('Supabase watchlist update error:', err);
    }
  };

  const removeTicker = (ticker, addToast) => {
    const next = watchlist.filter(t => t !== ticker);
    setWatchlist(next);
    syncToCloud(next);
    if (activeTicker === ticker) {
      const fallback = next.length > 0 ? next[0] : 'AAPL';
      setActiveTicker(fallback);
      localStorage.setItem('aethertrade_active_ticker', fallback);
    }
    addToast(`Removed ${ticker} from watchlist.`, 'info');
  };

  const addTicker = (ticker, addToast) => {
    let next = watchlist;
    if (!watchlist.includes(ticker)) {
      next = [...watchlist, ticker];
      setWatchlist(next);
      syncToCloud(next);
    }
    setActiveTicker(ticker);
    addToast(`Added ${ticker} to watchlist!`, 'success');
  };

  return { watchlist, setWatchlist, activeTicker, setActiveTicker, removeTicker, addTicker };
}
