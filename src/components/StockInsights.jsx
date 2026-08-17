import React, { useState, useMemo } from 'react';
import { getStockFundamentals } from '../utils/stockFundamentals';

export default function StockInsights({ activeTicker, currentPrice, historicalData }) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const fundamentals = useMemo(() => {
    return getStockFundamentals(activeTicker, currentPrice, historicalData);
  }, [activeTicker, currentPrice, historicalData]);

  const price = currentPrice || 150;
  const is52WNearHigh = fundamentals.range52Pct >= 75;
  const is52WNearLow = fundamentals.range52Pct <= 25;

  return (
    <div className={`stock-insights-container ${isCollapsed ? 'collapsed' : ''}`} id="stockInsightsPanel">
      <div className="insights-header" onClick={() => setIsCollapsed(!isCollapsed)}>
        <div className="insights-header-left">
          <div className="insights-icon-badge">
            <i className="fa-solid fa-chart-pie text-cyan"></i>
          </div>
          <div className="insights-header-text">
            <div className="insights-title-row">
              <h3 className="insights-title">Key Statistics & Fundamentals</h3>
              <span className="insights-sector-tag">{fundamentals.sector}</span>
            </div>
            <p className="insights-subtitle">Valuation multiples, earnings metrics & 52-week liquidity</p>
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
                  <span className="status-badge neutral">Mid-Range ({fundamentals.range52Pct.toFixed(0)}%)</span>
                )}
              </span>
            </div>

            <div className="range-52w-labels">
              <div className="range-point low">
                <span className="label">52W LOW</span>
                <span className="val tabular-nums">${fundamentals.fiftyTwoWeekLow.toFixed(2)}</span>
              </div>
              <div className="range-point current">
                <span className="label">CURRENT PRICE</span>
                <span className="val tabular-nums text-cyan">${price.toFixed(2)}</span>
              </div>
              <div className="range-point high">
                <span className="label">52W HIGH</span>
                <span className="val tabular-nums">${fundamentals.fiftyTwoWeekHigh.toFixed(2)}</span>
              </div>
            </div>

            <div className="range-52w-track-container">
              <div className="range-52w-track">
                <div
                  className="range-52w-fill"
                  style={{ width: `${fundamentals.range52Pct}%` }}
                ></div>
                <div
                  className="range-52w-pointer"
                  style={{ left: `${fundamentals.range52Pct}%` }}
                  title={`Current: $${price.toFixed(2)} (${fundamentals.range52Pct.toFixed(1)}% of 52W Range)`}
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
              <div className="chip-value tabular-nums">{fundamentals.marketCap}</div>
              <div className="chip-subtext">Enterprise Valuation</div>
            </div>

            <div className="fundamental-chip">
              <div className="chip-header">
                <span className="chip-label">P/E Ratio (TTM)</span>
                <i className="fa-solid fa-scale-balanced chip-icon text-primary"></i>
              </div>
              <div className="chip-value tabular-nums">{fundamentals.peRatio}</div>
              <div className="chip-subtext">Price to Earnings</div>
            </div>

            <div className="fundamental-chip">
              <div className="chip-header">
                <span className="chip-label">Forward P/E</span>
                <i className="fa-solid fa-forward chip-icon text-cyan"></i>
              </div>
              <div className="chip-value tabular-nums">{fundamentals.forwardPE}</div>
              <div className="chip-subtext">1-Year Projected</div>
            </div>

            <div className="fundamental-chip">
              <div className="chip-header">
                <span className="chip-label">EPS (TTM)</span>
                <i className="fa-solid fa-coins chip-icon text-bullish"></i>
              </div>
              <div className="chip-value tabular-nums text-bullish">{fundamentals.eps}</div>
              <div className="chip-subtext">Earnings Per Share</div>
            </div>

            <div className="fundamental-chip">
              <div className="chip-header">
                <span className="chip-label">Dividend Yield</span>
                <i className="fa-solid fa-hand-holding-dollar chip-icon text-warning"></i>
              </div>
              <div className="chip-value tabular-nums">{fundamentals.dividendYield}</div>
              <div className="chip-subtext">Annual Payout Rate</div>
            </div>

            <div className="fundamental-chip">
              <div className="chip-header">
                <span className="chip-label">Avg Volume (30D)</span>
                <i className="fa-solid fa-chart-simple chip-icon text-cyan"></i>
              </div>
              <div className="chip-value tabular-nums">{fundamentals.avgVolume30D}</div>
              <div className="chip-subtext">Daily Liquidity</div>
            </div>

            <div className="fundamental-chip">
              <div className="chip-header">
                <span className="chip-label">Beta (5Y)</span>
                <i className="fa-solid fa-wave-square chip-icon text-primary"></i>
              </div>
              <div className="chip-value tabular-nums">{fundamentals.beta}</div>
              <div className="chip-subtext">Market Volatility</div>
            </div>

            <div className="fundamental-chip">
              <div className="chip-header">
                <span className="chip-label">Shares Out</span>
                <i className="fa-solid fa-layer-group chip-icon text-muted"></i>
              </div>
              <div className="chip-value tabular-nums">{fundamentals.sharesOutstanding}</div>
              <div className="chip-subtext">Total Float Shares</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
