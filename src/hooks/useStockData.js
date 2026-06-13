import { useState, useEffect, useCallback, useRef } from 'react';
import { parseStockLabels } from '../utils/stockUtils';

function loadCachedStocks() {
  try {
    const saved = localStorage.getItem('aethertrade_cached_stocks');
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error(e);
  }
  return {};
}

function persistStocks(stocks) {
  const toCache = {};
  Object.keys(stocks).forEach(ticker => {
    if (stocks[ticker] && stocks[ticker].isLive) {
      toCache[ticker] = stocks[ticker];
    }
  });
  localStorage.setItem('aethertrade_cached_stocks', JSON.stringify(toCache));
}

export function useStockData(activeTicker, selectedRange, selectedInterval, addToast) {
  const [stocks, setStocks] = useState(loadCachedStocks);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef(null);

  useEffect(() => {
    persistStocks(stocks);
  }, [stocks]);

  const loadStockData = useCallback(async (ticker, rangeVal, intervalVal, watchlist, setWatchlist, setActiveTicker) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    try {
      const res = await fetch(`/api/stock?ticker=${ticker}&range=${rangeVal}&interval=${intervalVal}`, {
        signal: controller.signal
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Proxy error: ${res.status}`);
      }
      const json = await res.json();
      if (json.status !== 'ok') {
        throw new Error(json.message || "Twelve Data error status");
      }

      const values = json.values || [];
      if (values.length === 0) throw new Error("No values returned in series");

      const fetchedPrice = parseFloat(values[values.length - 1].close);
      const firstPrice = values[0] ? parseFloat(values[0].close) : fetchedPrice;
      const timeframeChange = firstPrice ? ((fetchedPrice - firstPrice) / firstPrice) * 100 : 0;

      const { closes, labels } = parseStockLabels(values, intervalVal);

      setStocks(prev => ({
        ...prev,
        [ticker]: {
          ...prev[ticker],
          ticker,
          name: prev[ticker]?.name || `${ticker} Stock`,
          price: fetchedPrice,
          timeframeChange,
          liveCloses: closes,
          liveLabels: labels,
          liveRawValues: values,
          isLive: true
        }
      }));

      return { success: true };
    } catch (err) {
      if (err.name === 'AbortError') return { success: false, aborted: true };

      console.warn(`Could not load data for ${ticker}.`, err);

      const isSymbolNotFound = err.message.toLowerCase().includes("not found") ||
                               err.message.toLowerCase().includes("not valid") ||
                               err.message.toLowerCase().includes("invalid symbol");

      if (isSymbolNotFound) {
        addToast(`Ticker "${ticker}" does not exist!`, 'error');
        if (watchlist && setWatchlist) {
          const next = watchlist.filter(t => t !== ticker);
          setWatchlist(next);
          if (setActiveTicker) setActiveTicker(next.length > 0 ? next[0] : 'AAPL');
        }
      } else {
        addToast(`Failed to load data for ${ticker}.`, 'error');
      }

      return { success: false };
    } finally {
      setIsLoading(false);
    }
  }, [addToast]);

  const fetchBackgroundPrice = useCallback(async (ticker) => {
    try {
      const res = await fetch(`/api/stock?ticker=${ticker}&range=1M&interval=1d`);
      if (!res.ok) return;
      const json = await res.json();
      if (json.status !== 'ok') return;

      const values = json.values || [];
      if (values.length === 0) return;

      const fetchedPrice = parseFloat(values[values.length - 1].close);
      const prevPrice = values.length > 1 ? parseFloat(values[values.length - 2].close) : fetchedPrice;
      const change = prevPrice ? ((fetchedPrice - prevPrice) / prevPrice) * 100 : 0;

      setStocks(prev => ({
        ...prev,
        [ticker]: {
          ...prev[ticker],
          ticker,
          name: prev[ticker]?.name || `${ticker} Stock`,
          price: fetchedPrice,
          change,
          isLive: true
        }
      }));
    } catch {
      console.warn(`Background fetch failed for ${ticker}`);
    }
  }, []);

  const fetchPortfolioHistory = useCallback(async (ticker) => {
    try {
      const res = await fetch(`/api/stock?ticker=${ticker}&range=1Y&interval=1d`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      if (json.status !== 'ok') throw new Error();

      const values = json.values || [];
      if (values.length === 0) throw new Error();

      const closes = [];
      const labels = [];
      values.forEach(v => {
        closes.push(parseFloat(v.close));
        labels.push(v.datetime.split(' ')[0]);
      });

      setStocks(prev => ({
        ...prev,
        [ticker]: { ...prev[ticker], ticker, portfolioHistory: closes, portfolioLabels: labels, isLive: true }
      }));
    } catch {
      console.warn(`Portfolio history fetch failed for ${ticker}`);
    }
  }, []);

  return { stocks, setStocks, isLoading, loadStockData, fetchBackgroundPrice, fetchPortfolioHistory };
}
