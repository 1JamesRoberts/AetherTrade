import React, { useState, useEffect } from 'react';

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

export default function StockInsights({ activeTicker, currentPrice }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [liveFundamentals, setLiveFundamentals] = useState(() => {
    const cache = loadCachedFundamentals();
    return cache[activeTicker] || null;
  });
  const [isLoadingApi, setIsLoadingApi] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const ticker = activeTicker;
    const cache = loadCachedFundamentals();

    if (cache[ticker]) {
      setLiveFundamentals(cache[ticker]);
      setHasError(false);
    } else {
      setLiveFundamentals(null);
    }

    async function fetchLiveFundamentals() {
      setIsLoadingApi(true);
      setHasError(false);
      try {
        const res = await fetch(`/api/stock/fundamentals?ticker=${ticker}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json.status === 'ok' && isMounted) {
          setLiveFundamentals(json);
          const updatedCache = { ...loadCachedFundamentals(), [ticker]: json };
          saveFundamentalsCache(updatedCache);
        } else if (isMounted && !cache[ticker]) {
          setHasError(true);
        }
      } catch (err) {
        console.warn('Fundamentals API fetch failed:', err);
        if (isMounted && !cache[ticker]) {
          setHasError(true);
        }
      } finally {
        if (isMounted) setIsLoadingApi(false);
      }
    }

    fetchLiveFundamentals();

    return () => {
      isMounted = false;
    };
  }, [activeTicker]);

  const data = liveFundamentals;
  const price = currentPrice || 0;

  const low52 = data ? Number(data.fiftyTwoWeekLow || 0) : 0;
  const high52 = data ? Number(data.fiftyTwoWeekHigh || 0) : 0;

  const range52Pct = high52 > low52 && price > 0
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
              {data && data.sector && (
                <span className="insights-sector-tag">{data.sector}</span>
              )}
              {data && data.isLiveApi && (
                <span className="live-badge" title="Live data synced from Twelve Data API">
                  <i className="fa-solid fa-bolt"></i> Live API
                </span>
              )}
            </div>
            <p className="insights-subtitle">
              {data && data.industry ? `${data.industry} • ` : ''}Valuation multiples, earnings metrics & 52-week liquidity
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
          {isLoadingApi && !data ? (
            <div className="insights-loading-state">
              <div className="loading-spinner"></div>
              <span>Fetching live {activeTicker} fundamental statistics...</span>
            </div>
          ) : hasError && !data ? (
            <div className="insights-empty-state">
              <i className="fa-solid fa-circle-exclamation text-muted"></i>
              <span>No fundamental statistics available for {activeTicker}</span>
            </div>
          ) : data ? (
            <>
              {/* 52-Week Range Meter */}
              {low52 > 0 && high52 > 0 && (
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
                      <span className="val tabular-nums">${low52.toFixed(2)}</span>
                    </div>
                    {price > 0 && (
                      <div className="range-point current">
                        <span className="label">CURRENT PRICE</span>
                        <span className="val tabular-nums text-cyan">${price.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="range-point high">
                      <span className="label">52W HIGH</span>
                      <span className="val tabular-nums">${high52.toFixed(2)}</span>
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
              )}

              {/* 8-Card Fundamentals Metric Grid */}
              <div className="fundamentals-grid">
                <div className="fundamental-chip">
                  <div className="chip-header">
                    <span className="chip-label">Market Cap</span>
                    <i className="fa-solid fa-building-columns chip-icon text-cyan"></i>
                  </div>
                  <div className="chip-value tabular-nums">{data.marketCap || '--'}</div>
                  <div className="chip-subtext">Enterprise Valuation</div>
                </div>

                <div className="fundamental-chip">
                  <div className="chip-header">
                    <span className="chip-label">P/E Ratio (TTM)</span>
                    <i className="fa-solid fa-scale-balanced chip-icon text-primary"></i>
                  </div>
                  <div className="chip-value tabular-nums">{data.peRatio || '--'}</div>
                  <div className="chip-subtext">Price to Earnings</div>
                </div>

                <div className="fundamental-chip">
                  <div className="chip-header">
                    <span className="chip-label">Forward P/E</span>
                    <i className="fa-solid fa-forward chip-icon text-cyan"></i>
                  </div>
                  <div className="chip-value tabular-nums">{data.forwardPE || '--'}</div>
                  <div className="chip-subtext">1-Year Projected</div>
                </div>

                <div className="fundamental-chip">
                  <div className="chip-header">
                    <span className="chip-label">EPS (TTM)</span>
                    <i className="fa-solid fa-coins chip-icon text-bullish"></i>
                  </div>
                  <div className="chip-value tabular-nums text-bullish">{data.eps || '--'}</div>
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
                  <div className="chip-value tabular-nums">{data.avgVolume30D || '--'}</div>
                  <div className="chip-subtext">Daily Liquidity</div>
                </div>

                <div className="fundamental-chip">
                  <div className="chip-header">
                    <span className="chip-label">Beta (5Y)</span>
                    <i className="fa-solid fa-wave-square chip-icon text-primary"></i>
                  </div>
                  <div className="chip-value tabular-nums">{data.beta || '--'}</div>
                  <div className="chip-subtext">Market Volatility</div>
                </div>

                <div className="fundamental-chip">
                  <div className="chip-header">
                    <span className="chip-label">Shares Out</span>
                    <i className="fa-solid fa-layer-group chip-icon text-muted"></i>
                  </div>
                  <div className="chip-value tabular-nums">{data.sharesOutstanding || '--'}</div>
                  <div className="chip-subtext">Total Float Shares</div>
                </div>
              </div>

              {/* Company Profile & Executive Overview (Step 2) */}
              <div className="company-profile-card">
                <div className="profile-header">
                  <div className="profile-title-area">
                    <span className="profile-title">
                      <i className="fa-solid fa-building text-cyan"></i> About {data.name || activeTicker}
                    </span>
                    <div className="profile-tags-row">
                      {data.sector && <span className="profile-tag sector">{data.sector}</span>}
                      {data.industry && <span className="profile-tag industry">{data.industry}</span>}
                    </div>
                  </div>

                  {data.website && (
                    <a
                      href={data.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-company-website"
                      title={`Visit ${data.name || activeTicker} Official Website`}
                    >
                      <span>Website</span>
                      <i className="fa-solid fa-arrow-up-right-from-square"></i>
                    </a>
                  )}
                </div>

                {data.description && (
                  <p className="profile-description">
                    {data.description}
                  </p>
                )}

                <div className="profile-meta-grid">
                  <div className="meta-item">
                    <div className="meta-icon-wrapper">
                      <i className="fa-solid fa-user-tie text-cyan"></i>
                    </div>
                    <div className="meta-text">
                      <span className="meta-label">LEADERSHIP</span>
                      <span className="meta-value">{data.ceo || 'Executive Management'}</span>
                    </div>
                  </div>

                  <div className="meta-item">
                    <div className="meta-icon-wrapper">
                      <i className="fa-solid fa-location-dot text-primary"></i>
                    </div>
                    <div className="meta-text">
                      <span className="meta-label">HEADQUARTERS</span>
                      <span className="meta-value">{data.headquarters || 'United States'}</span>
                    </div>
                  </div>

                  <div className="meta-item">
                    <div className="meta-icon-wrapper">
                      <i className="fa-solid fa-users text-bullish"></i>
                    </div>
                    <div className="meta-text">
                      <span className="meta-label">EMPLOYEES</span>
                      <span className="meta-value">{data.employees || 'Corporate'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Wall Street Analyst Price Targets & Consensus (Step 3) */}
              {data.targetMean && data.targetMean > 0 && (
                <div className="analyst-targets-card">
                  <div className="analyst-header">
                    <div className="analyst-title-area">
                      <span className="analyst-title">
                        <i className="fa-solid fa-bullseye text-cyan"></i> Wall Street Analyst Targets
                      </span>
                      {data.numberOfAnalysts > 0 && (
                        <span className="analyst-coverage-badge">
                          {data.numberOfAnalysts} Analysts Covering
                        </span>
                      )}
                    </div>

                    <div className="analyst-consensus-wrapper">
                      <span className="consensus-label">CONSENSUS</span>
                      <span className={`status-badge ${
                        data.recommendationKey?.toLowerCase().includes('buy')
                          ? 'bullish'
                          : data.recommendationKey?.toLowerCase().includes('sell')
                            ? 'bearish'
                            : 'neutral'
                      }`}>
                        {data.recommendationKey || 'Hold'}
                      </span>
                    </div>
                  </div>

                  {/* Upside / Downside Callout Row */}
                  <div className="analyst-stats-callout">
                    <div className="callout-block">
                      <span className="callout-label">CONSENSUS 1Y TARGET</span>
                      <span className="callout-val tabular-nums text-cyan">${Number(data.targetMean).toFixed(2)}</span>
                    </div>

                    {price > 0 && (
                      <div className="callout-block right">
                        <span className="callout-label">IMPLIED RETURN</span>
                        {(() => {
                          const upside = ((data.targetMean - price) / price) * 100;
                          const isUp = upside >= 0;
                          return (
                            <span className={`callout-val tabular-nums ${isUp ? 'text-bullish' : 'text-bearish'}`}>
                              {isUp ? `+${upside.toFixed(1)}% Upside` : `${upside.toFixed(1)}% Downside`}
                            </span>
                          );
                        })()}
                      </div>
                    )}
                  </div>

                  {/* Price Target Range Bar */}
                  {data.targetLow && data.targetHigh && data.targetHigh > data.targetLow && (
                    <div className="target-range-container">
                      <div className="target-range-labels">
                        <div className="range-point low">
                          <span className="label">LOW TARGET</span>
                          <span className="val tabular-nums">${Number(data.targetLow).toFixed(2)}</span>
                        </div>
                        <div className="range-point current">
                          <span className="label">AVG TARGET</span>
                          <span className="val tabular-nums text-cyan">${Number(data.targetMean).toFixed(2)}</span>
                        </div>
                        <div className="range-point high">
                          <span className="label">HIGH TARGET</span>
                          <span className="val tabular-nums">${Number(data.targetHigh).toFixed(2)}</span>
                        </div>
                      </div>

                      <div className="target-track-wrapper">
                        <div className="target-track">
                          {(() => {
                            const range = data.targetHigh - data.targetLow;
                            const meanPos = Math.max(5, Math.min(95, ((data.targetMean - data.targetLow) / range) * 100));
                            const currentPos = price > 0 ? Math.max(0, Math.min(100, ((price - data.targetLow) / range) * 100)) : null;

                            return (
                              <>
                                <div className="target-fill" style={{ width: `${meanPos}%` }}></div>
                                <div className="target-mean-marker" style={{ left: `${meanPos}%` }} title={`Avg Target: $${Number(data.targetMean).toFixed(2)}`}>
                                  <div className="mean-line"></div>
                                </div>
                                {currentPos !== null && (
                                  <div className="target-current-marker" style={{ left: `${currentPos}%` }} title={`Current Price: $${price.toFixed(2)}`}>
                                    <div className="current-pin"></div>
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Analyst Ratings Breakdown Bar */}
                  {data.analystBreakdown && (
                    <div className="analyst-breakdown-section">
                      {(() => {
                        const bd = data.analystBreakdown;
                        const buys = (bd.strongBuy || 0) + (bd.buy || 0);
                        const holds = bd.hold || 0;
                        const sells = (bd.sell || 0) + (bd.strongSell || 0);
                        const total = buys + holds + sells;

                        if (total === 0) return null;

                        const buyPct = (buys / total) * 100;
                        const holdPct = (holds / total) * 100;
                        const sellPct = (sells / total) * 100;

                        return (
                          <>
                            <div className="breakdown-bar">
                              {buys > 0 && <div className="bar-segment buy" style={{ width: `${buyPct}%` }} title={`Buy / Strong Buy: ${buys}`}></div>}
                              {holds > 0 && <div className="bar-segment hold" style={{ width: `${holdPct}%` }} title={`Hold: ${holds}`}></div>}
                              {sells > 0 && <div className="bar-segment sell" style={{ width: `${sellPct}%` }} title={`Sell / Strong Sell: ${sells}`}></div>}
                            </div>

                            <div className="breakdown-legend">
                              <div className="legend-chip buy">
                                <span className="dot"></span>
                                <span>Buy: <strong>{buys}</strong> ({buyPct.toFixed(0)}%)</span>
                              </div>
                              <div className="legend-chip hold">
                                <span className="dot"></span>
                                <span>Hold: <strong>{holds}</strong> ({holdPct.toFixed(0)}%)</span>
                              </div>
                              <div className="legend-chip sell">
                                <span className="dot"></span>
                                <span>Sell: <strong>{sells}</strong> ({sellPct.toFixed(0)}%)</span>
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="insights-empty-state">
              <i className="fa-solid fa-chart-pie text-muted"></i>
              <span>No fundamental statistics available for {activeTicker}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
