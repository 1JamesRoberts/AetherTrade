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
        .select('tickers')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Supabase load watchlist error:', error);
        return;
      }

      if (data && Array.isArray(data.tickers) && data.tickers.length > 0) {
        setWatchlist(data.tickers);
        localStorage.setItem('aethertrade_watchlist', JSON.stringify(data.tickers));
      } else if (!data) {
        // Initial insert if user has no cloud watchlist record yet
        const currentList = loadWatchlist();
        const { error: insertErr } = await supabase
          .from('watchlists')
          .insert({
            user_id: user.id,
            tickers: currentList,
            updated_at: new Date().toISOString()
          });
        if (insertErr) console.error('Supabase initial watchlist insert error:', insertErr);
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
      .channel(`realtime_watchlists_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'watchlists'
        },
        async (payload) => {
          if (payload?.new && payload.new.user_id === user.id && Array.isArray(payload.new.tickers)) {
            setWatchlist(payload.new.tickers);
            localStorage.setItem('aethertrade_watchlist', JSON.stringify(payload.new.tickers));
          } else {
            loadCloudWatchlist();
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          loadCloudWatchlist();
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, loadCloudWatchlist]);

  // Cross-tab window storage synchronization
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'aethertrade_watchlist' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) {
            setWatchlist(parsed);
          }
        } catch (err) {
          console.error('Cross-tab watchlist sync error:', err);
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // LocalStorage persistence
  useEffect(() => {
    localStorage.setItem('aethertrade_watchlist', JSON.stringify(watchlist));
  }, [watchlist]);

  useEffect(() => {
    if (activeTicker) {
      localStorage.setItem('aethertrade_active_ticker', activeTicker);
    }
  }, [activeTicker]);

  const syncToCloud = useCallback(async (newList) => {
    if (!user) return;
    try {
      const { data: existing } = await supabase
        .from('watchlists')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('watchlists')
          .update({
            tickers: newList,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', user.id);
        if (error) console.error('Supabase watchlist update error:', error);
      } else {
        const { error } = await supabase
          .from('watchlists')
          .insert({
            user_id: user.id,
            tickers: newList,
            updated_at: new Date().toISOString()
          });
        if (error) console.error('Supabase watchlist insert error:', error);
      }
    } catch (err) {
      console.error('Supabase watchlist update error:', err);
    }
  }, [user]);

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
