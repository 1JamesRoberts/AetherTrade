import React, { useState, useEffect, useMemo } from 'react';
import { getStockFundamentals } from '../utils/stockFundamentals';

function loadCachedFundamentals() {
  try {
    const saved = localStorage.getItem('aethertrade_fundamentals_cache');
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error(e);
  }
  return {};
}

function saveFundamentalsCache(cache) {
  try {
    localStorage.setItem('aethertrade_fundamentals_cache', JSON.stringify(cache));
  } catch (e) {
    console.error(e);
  }
}

export default function StockInsights({ activeTicker, currentPrice, historicalData }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [liveFundamentals, setLiveFundamentals] = useState(() => {
    const cache = loadCachedFundamentals();
    return cache[activeTicker] || null;
  });
  const [isLoadingApi, setIsLoadingApi] = useState(false);

  // Fallback / initial computed data
  const fallbackData = useMemo(() => {
    return getStockFundamentals(activeTicker, currentPrice, historicalData);
  }, [activeTicker, currentPrice, historicalData]);

  // Fetch live institutional fundamentals from Twelve Data proxy
  useEffect(() => {
    let isMounted = true;
    const ticker = activeTicker;
    const cache = loadCachedFundamentals();

    // Clear stale data if the new ticker is not cached
    if (cache[ticker]) {
      setLiveFundamentals(cache[ticker]);
    } else {
      setLiveFundamentals(null);
    }

    async function fetchLiveFundamentals() {
      setIsLoadingApi(true);
      try {
        const res = await fetch(`/api/stock/fundamentals?ticker=${ticker}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json.status === 'ok' && isMounted) {
          setLiveFundamentals(json);
          const updatedCache = { ...loadCachedFundamentals(), [ticker]: json };
          saveFundamentalsCache(updatedCache);
        }
      } catch (err) {
        console.warn('Fundamentals API fetch skipped, using local fallback:', err);
      } finally {
        if (isMounted) setIsLoadingApi(false);
      }
    }

    fetchLiveFundamentals();

    return () => {
      isMounted = false;
    };
  }, [activeTicker]);

  // Merge live API data with local fallback data whenever API returns 'N/A' or partial data
  const data = useMemo(() => {
    if (!liveFundamentals) return fallbackData;

    const merged = { ...fallbackData, ...liveFundamentals };

    // Fall back to local DB/estimations if Twelve Data API returned 'N/A' or missing
    const statsKeys = ['marketCap', 'peRatio', 'forwardPE', 'eps', 'sharesOutstanding', 'dividendYield', 'beta', 'avgVolume30D'];
    statsKeys.forEach(key => {
      if (liveFundamentals[key] === 'N/A' || liveFundamentals[key] === undefined || liveFundamentals[key] === null) {
        merged[key] = fallbackData[key];
      }
    });

    const profileKeys = ['sector', 'industry', 'ceo', 'headquarters', 'employees', 'description'];
    profileKeys.forEach(key => {
      if (!liveFundamentals[key] || liveFundamentals[key] === 'N/A' || liveFundamentals[key] === 'Corporate' || liveFundamentals[key] === 'Equity Market') {
        merged[key] = fallbackData[key];
      }
    });

    return merged;
  }, [liveFundamentals, fallbackData]);
  const price = currentPrice || 150;

  const low52 = data.fiftyTwoWeekLow || fallbackData.fiftyTwoWeekLow || (price * 0.75);
  const high52 = data.fiftyTwoWeekHigh || fallbackData.fiftyTwoWeekHigh || (price * 1.35);

  const range52Pct = high52 > low52
    ? Math.max(0, Math.min(100, ((price - low52) / (high52 - low52)) * 100))
    : 50;

  const is52WNearHigh = range52Pct >= 75;
  const is52WNearLow = range52Pct <= 25;

  return (
    <div className={`stock-insights-container ${isCollapsed ? 'collapsed' : ''}`} id="stockInsightsPanel">
      <div className="insights-header" onClick={() => setIsCollapsed(!isCollapsed)}>
        <div className="insights-header-left">
          <div className="insights-icon-badge">
            <i className={`fa-solid fa-chart-pie text-cyan ${isLoadingApi ? 'fa-pulse' : ''}`}></i>
          </div>
          <div className="insights-header-text">
            <div className="insights-title-row">
              <h3 className="insights-title">Key Statistics & Fundamentals</h3>
              <span className="insights-sector-tag">{data.sector || 'Technology'}</span>
              {data.isLiveApi && (
                <span className="live-badge" title="Live data synced from Twelve Data API">
                  <i className="fa-solid fa-bolt"></i> Live API
                </span>
              )}
            </div>
            <p className="insights-subtitle">
              {data.industry ? `${data.industry} • ` : ''}Valuation multiples, earnings metrics & 52-week liquidity
            </p>
          </div>
        </div>

        <div className="insights-header-right">
          <button
            type="button"
            className="btn-insights-toggle"
            aria-label={isCollapsed ? "Expand Fundamentals" : "Collapse Fundamentals"}
          >
            <span>{isCollapsed ? 'Expand' : 'Collapse'}</span>
            <i className={`fa-solid ${isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'}`}></i>
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="insights-body">
          {/* 52-Week Range Meter */}
          <div className="range-52w-card">
            <div className="range-52w-header">
              <span className="range-52w-title">
                <i className="fa-solid fa-arrows-left-right text-cyan"></i> 52-Week Trading Range
              </span>
              <span className="range-52w-status">
                {is52WNearHigh ? (
                  <span className="status-badge bullish">Near 52W High</span>
                ) : is52WNearLow ? (
                  <span className="status-badge bearish">Near 52W Low</span>
                ) : (
                  <span className="status-badge neutral">Mid-Range ({range52Pct.toFixed(0)}%)</span>
                )}
              </span>
            </div>

            <div className="range-52w-labels">
              <div className="range-point low">
                <span className="label">52W LOW</span>
                <span className="val tabular-nums">${Number(low52).toFixed(2)}</span>
              </div>
              <div className="range-point current">
                <span className="label">CURRENT PRICE</span>
                <span className="val tabular-nums text-cyan">${price.toFixed(2)}</span>
              </div>
              <div className="range-point high">
                <span className="label">52W HIGH</span>
                <span className="val tabular-nums">${Number(high52).toFixed(2)}</span>
              </div>
            </div>

            <div className="range-52w-track-container">
              <div className="range-52w-track">
                <div
                  className="range-52w-fill"
                  style={{ width: `${range52Pct}%` }}
                ></div>
                <div
                  className="range-52w-pointer"
                  style={{ left: `${range52Pct}%` }}
                  title={`Current: $${price.toFixed(2)} (${range52Pct.toFixed(1)}% of 52W Range)`}
                >
                  <div className="pointer-pulse"></div>
                </div>
              </div>
            </div>
          </div>

          {/* 8-Card Fundamentals Metric Grid */}
          <div className="fundamentals-grid">
            <div className="fundamental-chip">
              <div className="chip-header">
                <span className="chip-label">Market Cap</span>
                <i className="fa-solid fa-building-columns chip-icon text-cyan"></i>
              </div>
              <div className="chip-value tabular-nums">{data.marketCap || 'N/A'}</div>
              <div className="chip-subtext">Enterprise Valuation</div>
            </div>

            <div className="fundamental-chip">
              <div className="chip-header">
                <span className="chip-label">P/E Ratio (TTM)</span>
                <i className="fa-solid fa-scale-balanced chip-icon text-primary"></i>
              </div>
              <div className="chip-value tabular-nums">{data.peRatio || 'N/A'}</div>
              <div className="chip-subtext">Price to Earnings</div>
            </div>

            <div className="fundamental-chip">
              <div className="chip-header">
                <span className="chip-label">Forward P/E</span>
                <i className="fa-solid fa-forward chip-icon text-cyan"></i>
              </div>
              <div className="chip-value tabular-nums">{data.forwardPE || 'N/A'}</div>
              <div className="chip-subtext">1-Year Projected</div>
            </div>

            <div className="fundamental-chip">
              <div className="chip-header">
                <span className="chip-label">EPS (TTM)</span>
                <i className="fa-solid fa-coins chip-icon text-bullish"></i>
              </div>
              <div className="chip-value tabular-nums text-bullish">{data.eps || 'N/A'}</div>
              <div className="chip-subtext">Earnings Per Share</div>
            </div>

            <div className="fundamental-chip">
              <div className="chip-header">
                <span className="chip-label">Dividend Yield</span>
                <i className="fa-solid fa-hand-holding-dollar chip-icon text-warning"></i>
              </div>
              <div className="chip-value tabular-nums">{data.dividendYield || '0.00%'}</div>
              <div className="chip-subtext">Annual Payout Rate</div>
            </div>

            <div className="fundamental-chip">
              <div className="chip-header">
                <span className="chip-label">Avg Volume (30D)</span>
                <i className="fa-solid fa-chart-simple chip-icon text-cyan"></i>
              </div>
              <div className="chip-value tabular-nums">{data.avgVolume30D || 'N/A'}</div>
              <div className="chip-subtext">Daily Liquidity</div>
            </div>

            <div className="fundamental-chip">
              <div className="chip-header">
                <span className="chip-label">Beta (5Y)</span>
                <i className="fa-solid fa-wave-square chip-icon text-primary"></i>
              </div>
              <div className="chip-value tabular-nums">{data.beta || '1.00'}</div>
              <div className="chip-subtext">Market Volatility</div>
            </div>

            <div className="fundamental-chip">
              <div className="chip-header">
                <span className="chip-label">Shares Out</span>
                <i className="fa-solid fa-layer-group chip-icon text-muted"></i>
              </div>
              <div className="chip-value tabular-nums">{data.sharesOutstanding || 'N/A'}</div>
              <div className="chip-subtext">Total Float Shares</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
