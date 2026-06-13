import { useState, useEffect, useCallback, useRef } from 'react';
import {
  STOCKS_METADATA,
  seedMockDatabase,
  generateWalk,
  getTimeframeLabels,
  parseStockLabels,
  buildMockFallback
} from '../utils/stockUtils';

function loadCachedStocks(base) {
  try {
    const saved = localStorage.getItem('aethertrade_cached_stocks');
    if (saved) {
      const parsed = JSON.parse(saved);
      Object.keys(parsed).forEach(ticker => {
        base[ticker] = { ...base[ticker], ...parsed[ticker], isLive: true };
      });
    }
  } catch (e) {
    console.error(e);
  }
  return base;
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
  const [stocks, setStocks] = useState(() => loadCachedStocks(seedMockDatabase()));
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
      const prevPrice = values.length > 1 ? parseFloat(values[values.length - 2].close) : fetchedPrice;
      const dailyChange = prevPrice ? ((fetchedPrice - prevPrice) / prevPrice) * 100 : 0;
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
          change: dailyChange,
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

      console.warn(`Could not load Twelve Data for ${ticker}. Seeding fallback mock walk.`, err);

      const popular = STOCKS_METADATA.find(s => s.ticker === ticker);
      const isSymbolNotFound = err.message.toLowerCase().includes("not found") ||
                               err.message.toLowerCase().includes("not valid") ||
                               err.message.toLowerCase().includes("invalid symbol");

      if (isSymbolNotFound && !popular) {
        addToast(`Ticker "${ticker}" does not exist on Twelve Data!`, 'error');
        if (watchlist && setWatchlist) {
          const next = watchlist.filter(t => t !== ticker);
          setWatchlist(next);
          if (setActiveTicker) setActiveTicker(next.length > 0 ? next[0] : 'AAPL');
        }
        return { success: false, notFound: true };
      }

      const base = stocks[ticker] || seedMockDatabase()[ticker] || {
        ticker, name: `${ticker} Stock`, price: 150.00, change: 0.0, history: {}
      };
      const basePrice = base.price || 150.00;
      const mockHistory = base.history || buildMockFallback(ticker, basePrice);
      const closes = mockHistory[intervalVal] || generateWalk(basePrice, 100, 'up', 0.01);
      const labels = getTimeframeLabels(intervalVal);

      setStocks(prev => ({
        ...prev,
        [ticker]: {
          ...prev[ticker],
          ticker,
          name: prev[ticker]?.name || `${ticker} Stock`,
          price: basePrice,
          change: base.change || 0.35,
          timeframeChange: 1.25,
          liveCloses: closes,
          liveLabels: labels,
          liveRawValues: null,
          history: mockHistory,
          isLive: true
        }
      }));

      return { success: false };
    } finally {
      setIsLoading(false);
    }
  }, [stocks, addToast]);

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
      const basePrice = stocks[ticker]?.price || 150.00;
      const mockHistory = stocks[ticker]?.history || { '1d': generateWalk(basePrice, 260, 'up', 0.012) };
      const mockCloses = mockHistory['1d'];
      const mockLabels = [];
      const today = new Date();
      for (let i = 0; i < 260; i++) {
        const d = new Date(today.getTime() - (260 - 1 - i) * 24 * 60 * 60 * 1000);
        mockLabels.push(d.toISOString().split('T')[0]);
      }

      setStocks(prev => ({
        ...prev,
        [ticker]: { ...prev[ticker], ticker, portfolioHistory: mockCloses, portfolioLabels: mockLabels, isLive: true }
      }));
    }
  }, [stocks]);

  return { stocks, setStocks, isLoading, loadStockData, fetchBackgroundPrice, fetchPortfolioHistory };
}
