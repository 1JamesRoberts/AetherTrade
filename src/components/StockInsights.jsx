import { MetricGrid } from './ui/Controls.jsx';
import { useState, useEffect } from 'react';
import {
  detectTickerCurrency,
  getCurrencySymbol,
  formatMoney
} from '../utils/currencyUtils';

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

function calculateRSI(closes, period = 14) {
  if (!closes || closes.length <= period) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff >= 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateEMA(prices, period) {
  if (!prices || prices.length === 0) return [];
  const k = 2 / (period + 1);
  let ema = prices[0];
  const emaValues = [ema];
  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
    emaValues.push(ema);
  }
  return emaValues;
}

function calculateMACD(closes) {
  if (!closes || closes.length < 26) return null;
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = calculateEMA(macdLine, 9);
  const latestMacd = macdLine[macdLine.length - 1];
  const latestSignal = signalLine[signalLine.length - 1];
  const histogram = latestMacd - latestSignal;

  const prevMacd = macdLine.length > 1 ? macdLine[macdLine.length - 2] : latestMacd;
  const prevSignal = signalLine.length > 1 ? signalLine[signalLine.length - 2] : latestSignal;
  const prevHistogram = prevMacd - prevSignal;
  const isGrowing = histogram >= prevHistogram;

  return { macd: latestMacd, signal: latestSignal, histogram, prevHistogram, isGrowing };
}

function calculateSMAValue(closes, period) {
  if (!closes || closes.length < period) return null;
  const slice = closes.slice(closes.length - period);
  const sum = slice.reduce((a, b) => a + b, 0);
  return sum / period;
}

function formatPercentValue(val) {
  if (val === null || val === undefined || val === 'N/A' || val === '') return '0.00%';
  const str = String(val).trim();
  if (str.endsWith('%')) return str;
  const num = parseFloat(str.replace(/,/g, ''));
  return isNaN(num) ? '0.00%' : `${num.toFixed(2)}%`;
}

function formatLargeNumber(val, isCurrency = false, currency = 'USD') {
  if (val === null || val === undefined || val === 'N/A' || val === '') return '--';
  const str = String(val).trim();
  if (/[KMBT]$/i.test(str) || str.startsWith('$') || str.startsWith('฿')) return str;
  const cleanStr = str.replace(/,/g, '');
  const num = parseFloat(cleanStr);
  if (isNaN(num)) return str;
  const prefix = isCurrency ? getCurrencySymbol(currency) : '';
  if (num >= 1e12) return `${prefix}${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `${prefix}${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `${prefix}${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `${prefix}${(num / 1e3).toFixed(0)}K`;
  return `${prefix}${num.toLocaleString()}`;
}

export default function StockInsights({ activeTicker, currentPrice, historicalData = [] }) {
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
  const tickerCurr = data?.currency || detectTickerCurrency(activeTicker);

  const low52 = data ? Number(data.fiftyTwoWeekLow || 0) : 0;
  const high52 = data ? Number(data.fiftyTwoWeekHigh || 0) : 0;

  const range52Pct = high52 > low52 && price > 0
    ? Math.max(0, Math.min(100, ((price - low52) / (high52 - low52)) * 100))
    : 50;

  const is52WNearHigh = range52Pct >= 75;
  const is52WNearLow = range52Pct <= 25;

  return (
    <div className={`stock-insights-container ${isCollapsed ? 'collapsed' : ''}`} id="stockInsightsPanel">
      <div className="insights-header">
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
            onClick={() => setIsCollapsed(!isCollapsed)}
            aria-expanded={!isCollapsed}
            aria-controls="stock-insights-content"
            aria-label={isCollapsed ? 'Expand insights panel' : 'Collapse insights panel'}
          >
            <i className={`fa-solid fa-chevron-${isCollapsed ? 'down' : 'up'}`}></i>
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="insights-body" id="stock-insights-content">
          {isLoadingApi && !data ? (
            <div className="insights-loading-skeleton">
              <div className="skeleton-line"></div>
              <div className="skeleton-grid">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <div key={i} className="skeleton-chip"></div>
                ))}
              </div>
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
                      <span className="val tabular-nums">{formatMoney(low52, tickerCurr)}</span>
                    </div>
                    {price > 0 && (
                      <div className="range-point current">
                        <span className="label">CURRENT PRICE</span>
                        <span className="val tabular-nums text-cyan">{formatMoney(price, tickerCurr)}</span>
                      </div>
                    )}
                    <div className="range-point high">
                      <span className="label">52W HIGH</span>
                      <span className="val tabular-nums">{formatMoney(high52, tickerCurr)}</span>
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
                        title={`Current: ${formatMoney(price, tickerCurr)} (${range52Pct.toFixed(1)}% of 52W Range)`}
                      >
                        <div className="pointer-pulse"></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Fundamentals are a semantic set of values with consistent emphasis. */}
              <MetricGrid label="Company fundamentals" items={[
                { label: 'Market cap', value: formatLargeNumber(data.marketCap, true, tickerCurr), hint: 'Enterprise valuation' },
                { label: 'P/E ratio', value: data.peRatio || '--', hint: 'Trailing twelve months' },
                { label: 'Forward P/E', value: data.forwardPE || '--', hint: 'One-year projected' },
                { label: 'EPS', value: data.eps || '--', hint: 'Trailing twelve months' },
                { label: 'Dividend yield', value: formatPercentValue(data.dividendYield), hint: 'Annual payout rate' },
                { label: 'Average volume', value: formatLargeNumber(data.avgVolume30D), hint: '30-day daily average' },
                { label: 'Beta', value: data.beta || '--', hint: 'Market volatility' },
                { label: 'Shares outstanding', value: formatLargeNumber(data.sharesOutstanding), hint: 'Total float shares' },
              ]} />

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
                      <span className="callout-val tabular-nums text-cyan">{formatMoney(Number(data.targetMean), tickerCurr)}</span>
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

                  {/* Price Target Range Bar with strict [0, 100] proportional clamping */}
                  {data.targetLow && data.targetHigh && data.targetHigh > data.targetLow && (
                    <div className="target-range-container">
                      <div className="target-range-labels">
                        <div className="range-point low">
                          <span className="label">LOW TARGET</span>
                          <span className="val tabular-nums">{formatMoney(Number(data.targetLow), tickerCurr)}</span>
                        </div>
                        <div className="range-point current">
                          <span className="label">AVG TARGET</span>
                          <span className="val tabular-nums text-cyan">{formatMoney(Number(data.targetMean), tickerCurr)}</span>
                        </div>
                        <div className="range-point high">
                          <span className="label">HIGH TARGET</span>
                          <span className="val tabular-nums">{formatMoney(Number(data.targetHigh), tickerCurr)}</span>
                        </div>
                      </div>

                      <div className="target-track-wrapper">
                        <div className="target-track">
                          {(() => {
                            const range = data.targetHigh - data.targetLow;
                            const meanPos = Math.max(0, Math.min(100, ((data.targetMean - data.targetLow) / range) * 100));
                            const currentPos = price > 0 ? Math.max(0, Math.min(100, ((price - data.targetLow) / range) * 100)) : null;

                            return (
                              <>
                                <div className="target-fill" style={{ width: `${meanPos}%` }}></div>
                                <div className="target-mean-marker" style={{ left: `${meanPos}%` }} title={`Avg Target: ${formatMoney(Number(data.targetMean), tickerCurr)}`}>
                                  <div className="mean-line"></div>
                                </div>
                                {currentPos !== null && (
                                  <div className="target-current-marker" style={{ left: `${currentPos}%` }} title={`Current Price: ${formatMoney(price, tickerCurr)}`}>
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

              {/* Technical Health & Momentum Summary Gauge (Step 4) */}
              {(() => {
                const closes = (historicalData || [])
                  .map(d => (typeof d.close === 'number' ? d.close : (typeof d.value === 'number' ? d.value : null)))
                  .filter(v => v !== null);

                if (closes.length < 15) return null;

                const rsi = calculateRSI(closes, 14);
                const macd = calculateMACD(closes);
                const sma20 = calculateSMAValue(closes, 20);
                const sma50 = calculateSMAValue(closes, 50);

                // Institutional Multi-Factor Momentum Evaluation
                let bullishPoints = 0;
                let maxPoints = 0;

                // Factor 1: RSI (14) Momentum & Overbought Nuance (Weight: 3 pts)
                if (rsi !== null) {
                  maxPoints += 3;
                  if (rsi >= 55 && rsi <= 70) {
                    bullishPoints += 3; // Healthy bullish trend zone
                  } else if (rsi > 70) {
                    bullishPoints += 1.5; // Overbought: positive trend but elevated pullback risk
                  } else if (rsi >= 45 && rsi < 55) {
                    bullishPoints += 1.5; // Neutral balance
                  } else if (rsi >= 30 && rsi < 45) {
                    bullishPoints += 0.5; // Bearish weakness
                  } else {
                    bullishPoints += 1.0; // Oversold (<30): potential mean-reversion watch
                  }
                }

                // Factor 2: MACD Histogram & Momentum Delta (Weight: 3 pts)
                if (macd !== null) {
                  maxPoints += 3;
                  if (macd.histogram > 0 && macd.isGrowing) {
                    bullishPoints += 3; // Bullish Expansion (+3 pts)
                  } else if (macd.histogram > 0) {
                    bullishPoints += 2; // Bullish Weakening (+2 pts)
                  } else if (macd.histogram < 0 && macd.isGrowing) {
                    bullishPoints += 1; // Bearish Weakening / Bottoming (+1 pt)
                  } else {
                    bullishPoints += 0; // Bearish Expansion (0 pts)
                  }
                }

                // Factor 3: Price vs. Short-Term SMA 20 (Weight: 2 pts)
                if (sma20 !== null && price > 0) {
                  maxPoints += 2;
                  if (price > sma20) {
                    bullishPoints += 2;
                  }
                }

                // Factor 4: SMA 20 vs. SMA 50 Alignment (Weight: 2 pts)
                if (sma20 !== null && sma50 !== null && price > 0) {
                  maxPoints += 2;
                  if (price > sma20 && sma20 > sma50) {
                    bullishPoints += 2; // Golden alignment
                  } else if (price > sma50) {
                    bullishPoints += 1;
                  }
                }

                const signalScore = maxPoints > 0 ? (bullishPoints / maxPoints) : 0.5;
                let overallSignal = 'Neutral';
                let signalClass = 'neutral';

                if (signalScore >= 0.75) {
                  overallSignal = 'Strong Buy';
                  signalClass = 'bullish';
                } else if (signalScore >= 0.55) {
                  overallSignal = 'Bullish';
                  signalClass = 'bullish';
                } else if (signalScore <= 0.25) {
                  overallSignal = 'Strong Sell';
                  signalClass = 'bearish';
                } else if (signalScore < 0.40) {
                  overallSignal = 'Bearish';
                  signalClass = 'bearish';
                }

                const rsiPct = rsi !== null ? Math.max(0, Math.min(100, rsi)) : 50;

                return (
                  <div className="technical-health-card">
                    <div className="tech-header">
                      <div className="tech-title-area">
                        <span className="tech-title">
                          <i className="fa-solid fa-gauge-high text-cyan"></i> Technical Health & Momentum
                        </span>
                        <span className="tech-subtitle">Live Indicator Analysis</span>
                      </div>

                      <div className="tech-summary-badge-wrapper">
                        <span className="consensus-label">SUMMARY SIGNAL</span>
                        <span className={`status-badge ${signalClass}`}>
                          {overallSignal}
                        </span>
                      </div>
                    </div>

                    {/* Technical Indicator Tri-Grid */}
                    <div className="tech-indicators-grid">
                      {/* RSI (14) Card */}
                      <div className="tech-indicator-item">
                        <div className="tech-item-header">
                          <span className="indicator-name">RSI (14)</span>
                          <span className={`indicator-status-pill ${
                            rsi === null
                              ? 'neutral'
                              : rsi > 70
                                ? 'overbought'
                                : rsi > 55
                                  ? 'bullish'
                                  : rsi >= 45
                                    ? 'neutral'
                                    : rsi >= 30
                                      ? 'bearish'
                                      : 'oversold'
                          }`}>
                            {rsi === null
                              ? 'No Data'
                              : rsi > 70
                                ? 'Overbought'
                                : rsi > 55
                                  ? 'Bullish'
                                  : rsi >= 45
                                    ? 'Neutral'
                                    : rsi >= 30
                                      ? 'Bearish'
                                      : 'Oversold'}
                          </span>
                        </div>

                        <div className="indicator-value-row">
                          <span className="indicator-main-val tabular-nums">
                            {rsi !== null ? rsi.toFixed(1) : '--'}
                          </span>
                          <span className="indicator-subtext">Oscillator (0–100)</span>
                        </div>

                        {/* RSI 0-100 Gauge Track */}
                        <div className="rsi-gauge-wrapper">
                          <div className="rsi-gauge-track">
                            <div className="rsi-zone oversold" title="Oversold Zone (<30)"></div>
                            <div className="rsi-zone neutral" title="Neutral Zone (30–70)"></div>
                            <div className="rsi-zone overbought" title="Overbought Zone (>70)"></div>
                            <div className="rsi-pointer" style={{ left: `${rsiPct}%` }} title={`RSI: ${rsi !== null ? rsi.toFixed(1) : '--'}`}>
                              <div className="pointer-dot"></div>
                            </div>
                          </div>
                          <div className="rsi-labels">
                            <span>30</span>
                            <span>50</span>
                            <span>70</span>
                          </div>
                        </div>
                      </div>

                      {/* MACD (12, 26, 9) Card */}
                      <div className="tech-indicator-item">
                        <div className="tech-item-header">
                          <span className="indicator-name">MACD (12, 26, 9)</span>
                          {macd ? (
                            <span className={`indicator-status-pill ${
                              macd.histogram >= 0
                                ? (macd.isGrowing ? 'bullish' : 'neutral')
                                : (macd.isGrowing ? 'neutral' : 'bearish')
                            }`}>
                              {macd.histogram >= 0
                                ? (macd.isGrowing ? 'Bullish Expansion' : 'Bullish Weakening')
                                : (macd.isGrowing ? 'Bearish Weakening' : 'Bearish Expansion')}
                            </span>
                          ) : (
                            <span className="indicator-status-pill neutral">
                              No Data (&lt; 26 Bars)
                            </span>
                          )}
                        </div>

                        <div className="indicator-value-row">
                          {macd ? (
                            <span className={`indicator-main-val tabular-nums ${macd.histogram >= 0 ? 'text-bullish' : 'text-bearish'}`}>
                              {macd.histogram >= 0 ? `+${macd.histogram.toFixed(2)}` : macd.histogram.toFixed(2)}
                            </span>
                          ) : (
                            <span className="indicator-main-val tabular-nums text-muted">
                              --
                            </span>
                          )}
                          <span className="indicator-subtext">{macd ? (macd.isGrowing ? 'Expanding Delta' : 'Weakening Delta') : 'Requires 26+ data points'}</span>
                        </div>

                        <div className="macd-details-row tabular-nums">
                          <div className="detail-stat">
                            <span className="lbl">MACD</span>
                            <span className="val text-cyan">{macd ? macd.macd.toFixed(2) : '--'}</span>
                          </div>
                          <div className="detail-stat">
                            <span className="lbl">SIGNAL</span>
                            <span className="val text-muted">{macd ? macd.signal.toFixed(2) : '--'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Moving Averages Alignment Card */}
                      <div className="tech-indicator-item">
                        <div className="tech-item-header">
                          <span className="indicator-name">Trend Alignment</span>
                          {sma20 && price > 0 ? (
                            <span className={`indicator-status-pill ${
                              sma50 && price > sma20 && sma20 > sma50
                                ? 'bullish'
                                : price > sma20
                                  ? 'bullish'
                                  : 'bearish'
                            }`}>
                              {sma50 && price > sma20 && sma20 > sma50
                                ? 'Golden Alignment'
                                : price > sma20
                                  ? 'Price > SMA 20'
                                  : sma50 && price < sma20 && sma20 < sma50
                                    ? 'Death Alignment'
                                    : 'Price < SMA 20'}
                            </span>
                          ) : (
                            <span className="indicator-status-pill neutral">
                              No Data (&lt; 20 Bars)
                            </span>
                          )}
                        </div>

                        <div className="indicator-value-row">
                          {sma20 ? (
                            <span className="indicator-main-val tabular-nums text-cyan">
                              ${sma20.toFixed(2)}
                            </span>
                          ) : (
                            <span className="indicator-main-val tabular-nums text-muted">
                              --
                            </span>
                          )}
                          <span className="indicator-subtext">{sma20 ? '20-Day Simple Moving Avg' : 'Requires 20+ data points'}</span>
                        </div>

                        <div className="macd-details-row tabular-nums">
                          <div className="detail-stat">
                            <span className="lbl">SMA 50</span>
                            <span className="val">{sma50 ? `$${sma50.toFixed(2)}` : '--'}</span>
                          </div>
                          <div className="detail-stat">
                            <span className="lbl">SPREAD</span>
                            <span className={`val ${sma20 && sma50 ? (sma20 > sma50 ? 'text-bullish' : 'text-bearish') : 'text-muted'}`}>
                              {sma20 && sma50 ? `${(((sma20 - sma50) / sma50) * 100).toFixed(1)}%` : '--'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
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
