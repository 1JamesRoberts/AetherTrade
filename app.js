// ==========================================================================
// AETHERTRADE - ENGINE & INTERACTIVITY CODE (LIVE TWELVE DATA EDITION)
// ==========================================================================

// 1. Initial State & Fallback Metadata
const STOCKS_METADATA = [
  { ticker: 'AAPL', name: 'Apple Inc.', price: 185.50, change: 1.45, trend: 'up' },
  { ticker: 'MSFT', name: 'Microsoft Corp.', price: 420.10, change: 0.85, trend: 'up' },
  { ticker: 'NVDA', name: 'NVIDIA Corp.', price: 925.00, change: 4.82, trend: 'up' },
  { ticker: 'TSLA', name: 'Tesla Inc.', price: 178.20, change: -2.31, trend: 'down' },
  { ticker: 'GOOG', name: 'Alphabet Inc.', price: 172.50, change: 1.12, trend: 'up' },
  { ticker: 'AMZN', name: 'Amazon.com Inc.', price: 180.80, change: -0.45, trend: 'down' }
];

// App State
const state = {
  activeTicker: 'AAPL',
  currentCapital: 10000,
  selectedTimeframe: 'M',
  chartType: 'line', // 'line' or 'candle'
  showLevels: true, // Show/Hide S&R Overlay lines and allow clicks
  zoomLevel: 100, // Zoom percentage (20 to 100)
  stocks: {},
  // Format: linesMap[ticker] = [ price1, price2, ... ]
  linesMap: {
  },
  hoverPrice: null,
  watchlist: []
};

// Load watchlist from localStorage or fallback defaults
function loadWatchlist() {
  try {
    const saved = localStorage.getItem('aethertrade_watchlist');
    if (saved) {
      state.watchlist = JSON.parse(saved);
      if (state.watchlist.length > 0) {
        if (!state.watchlist.includes(state.activeTicker)) {
          state.activeTicker = state.watchlist[0];
        }
      } else {
        state.activeTicker = 'AAPL';
      }
      return;
    }
  } catch (e) {
    console.error('Failed to load watchlist from localStorage', e);
  }
  state.watchlist = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'GOOG', 'AMZN'];
}

function saveWatchlist() {
  try {
    localStorage.setItem('aethertrade_watchlist', JSON.stringify(state.watchlist));
  } catch (e) {
    console.error('Failed to save watchlist to localStorage', e);
  }
}

// Save active stock list prices, metadata, and curves to local storage cache
function saveCachedStocks() {
  try {
    const toCache = {};
    Object.keys(state.stocks).forEach(ticker => {
      if (state.stocks[ticker] && state.stocks[ticker].isLive) {
        toCache[ticker] = state.stocks[ticker];
      }
    });
    localStorage.setItem('aethertrade_cached_stocks', JSON.stringify(toCache));
  } catch (e) {
    console.error('Failed to save cached stocks to localStorage', e);
  }
}

// Load cached stock prices and historical data to prevent blank layouts and loading bars on reload
function loadCachedStocks() {
  try {
    const saved = localStorage.getItem('aethertrade_cached_stocks');
    if (saved) {
      const parsed = JSON.parse(saved);
      Object.keys(parsed).forEach(ticker => {
        state.stocks[ticker] = parsed[ticker];
        state.stocks[ticker].isLive = true; // Mark as live immediately
      });
      return true;
    }
  } catch (e) {
    console.error('Failed to load cached stocks from localStorage', e);
  }
  return false;
}

// Save all drawn horizontal support and resistance lines to local storage
function saveSupportResistanceLines() {
  try {
    localStorage.setItem('aethertrade_support_resistance', JSON.stringify(state.linesMap));
  } catch (e) {
    console.error('Failed to save support/resistance lines to localStorage', e);
  }
}

// Load custom drawn support/resistance lines to restore on load
function loadSupportResistanceLines() {
  try {
    const saved = localStorage.getItem('aethertrade_support_resistance');
    if (saved) {
      state.linesMap = JSON.parse(saved);
      return true;
    }
  } catch (e) {
    console.error('Failed to load support/resistance lines from localStorage', e);
  }
  state.linesMap = {};
  return false;
}

// 2. Generate Fallback Mock Database (in case live requests fail)
function seedMockDatabase() {
  const watchlistTickers = state.watchlist || ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'GOOG', 'AMZN'];
  const tickersToSeed = new Set([
    ...STOCKS_METADATA.map(s => s.ticker),
    ...watchlistTickers
  ]);

  tickersToSeed.forEach(ticker => {
    const meta = STOCKS_METADATA.find(s => s.ticker === ticker) || {
      ticker: ticker,
      name: ticker + ' Stock',
      price: 150.00,
      change: 0.0,
      trend: 'up'
    };

    const historyD = generateWalk(meta.price, 24, meta.trend, 0.005);
    const historyW = generateWalk(meta.price, 7, meta.trend, 0.012);
    const historyM = generateWalk(meta.price, 30, meta.trend, 0.015);
    const historyY = generateWalk(meta.price, 52, meta.trend, 0.025);

    state.stocks[ticker] = {
      ...meta,
      isLive: false,
      history: {
        D: historyD,
        W: historyW,
        M: historyM,
        Y: historyY
      },
      // Pre-populate live closes with Monthly history to ensure immediate rendering on selection!
      liveCloses: [...historyM],
      liveLabels: getTimeframeLabels('M'),
      liveRawValues: []
    };
    if (!state.linesMap[ticker]) {
      state.linesMap[ticker] = [];
    }
  });
}

function generateWalk(currentPrice, points, overallTrend, volatility) {
  const result = [];
  let price = currentPrice;
  const bias = overallTrend === 'up' ? 0.002 : -0.002;

  for (let i = points - 1; i >= 0; i--) {
    result.unshift(parseFloat(price.toFixed(2)));
    const changePercent = (Math.random() - 0.5) * volatility + bias;
    price = price / (1 + changePercent);
  }

  result[result.length - 1] = currentPrice;
  return result;
}

function getTimeframeLabels(timeframe) {
  switch (timeframe) {
    case 'D':
      return Array.from({ length: 24 }, (_, i) => {
        const hour = 9 + Math.floor(i * 7 / 24);
        const min = Math.floor((i * 7 % 24) * 60 / 24);
        return `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
      });
    case 'W':
      return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    case 'M':
      return Array.from({ length: 30 }, (_, i) => `Day ${i + 1}`);
    case 'Y':
      return Array.from({ length: 52 }, (_, i) => `Wk ${i + 1}`);
    default:
      return [];
  }
}

// Premium glassmorphic toast notification system
function showNotification(message, type = 'success') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.style.cssText = `
      position: fixed;
      top: 24px;
      right: 24px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 12px;
      pointer-events: none;
    `;
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast-item ${type}`;
  toast.style.cssText = `
    min-width: 280px;
    max-width: 380px;
    padding: 14px 20px;
    border-radius: 8px;
    background: rgba(13, 20, 38, 0.85);
    backdrop-filter: blur(16px);
    border: 1px solid ${type === 'error' ? 'rgba(244, 63, 94, 0.3)' : 'rgba(16, 185, 129, 0.3)'};
    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.4);
    color: #fff;
    font-family: 'Outfit', sans-serif;
    font-size: 13px;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 12px;
    pointer-events: auto;
    transform: translateX(120%);
    transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.4s ease;
    opacity: 0;
  `;

  const icon = type === 'error'
    ? '<i class="fa-solid fa-triangle-exclamation" style="color: #f43f5e; font-size: 16px;"></i>'
    : '<i class="fa-solid fa-circle-check" style="color: #10b981; font-size: 16px;"></i>';

  toast.innerHTML = `
    ${icon}
    <div style="flex-grow: 1; line-height: 1.4;">${message}</div>
    <button style="background: transparent; border: none; color: rgba(255,255,255,0.4); cursor: pointer; padding: 2px; font-size: 14px; display: flex; align-items: center;" onclick="this.parentElement.remove()">&times;</button>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.transform = 'translateX(0)';
    toast.style.opacity = '1';
  }, 50);

  setTimeout(() => {
    toast.style.transform = 'translateX(120%)';
    toast.style.opacity = '0';
    setTimeout(() => {
      toast.remove();
    }, 400);
  }, 4000);
}

// 3. Live Twelve Data API Fetcher with dynamic key rotation and fallback handlers
async function loadStockDataAndRender(ticker) {
  const chartContainer = document.querySelector('.chart-container');
  if (chartContainer) chartContainer.classList.add('loading');

  // Immediately destroy old chart and render clear canvas with glowing loading text in the center
  if (mainChart) {
    mainChart.destroy();
    mainChart = null;
  }

  const canvasElement = document.getElementById('mainChart');
  if (canvasElement) {
    const ctx = canvasElement.getContext('2d');
    ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    ctx.save();
    ctx.fillStyle = '#00f0ff'; // Neon cyan
    ctx.font = '600 14px "Outfit", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur = 10;
    ctx.shadowColor = 'rgba(0, 240, 255, 0.4)';
    ctx.fillText(`Retrieving Live ${ticker} Market Data...`, canvasElement.width / 2, canvasElement.height / 2);
    ctx.restore();
  }

  try {
    const response = await fetch(`/api/stock?ticker=${ticker}&timeframe=${state.selectedTimeframe}`);
    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.error || `Proxy error: ${response.status}`);
    }
    const json = await response.json();

    // Check Twelve Data response status
    if (json.status !== 'ok') {
      throw new Error(json.message || "Twelve Data returned error status");
    }

    const values = json.values || [];
    if (values.length === 0) {
      throw new Error("No values returned in time series");
    }

    const fetchedPrice = parseFloat(values[values.length - 1].close);
    if (!state.stocks[ticker]) {
      state.stocks[ticker] = {};
    }

    // Only update the authoritative real-time price from the timeframe M (daily series),
    // or if no price is cached yet, to keep the price unified and prevent it from shifting
    // when toggling timeframe views (like D, W, or Y).
    if (state.selectedTimeframe === 'M' || !state.stocks[ticker].price) {
      state.stocks[ticker].price = fetchedPrice;
    }

    const currentPrice = state.stocks[ticker].price || fetchedPrice;

    // Ensure the last candle close is exactly equal to the currentPrice
    if (values.length > 0) {
      values[values.length - 1].close = currentPrice.toString();
      const currentHigh = parseFloat(values[values.length - 1].high || 0);
      const currentLow = parseFloat(values[values.length - 1].low || 0);
      if (currentPrice > currentHigh) {
        values[values.length - 1].high = currentPrice.toString();
      }
      if (currentPrice < currentLow) {
        values[values.length - 1].low = currentPrice.toString();
      }
    }

    // Determine the true previous day's close price for the 1-Day change percentage
    let dailyPrevPrice = currentPrice;
    if (state.selectedTimeframe === 'M') {
      dailyPrevPrice = values.length > 1 ? parseFloat(values[values.length - 2].close) : currentPrice;
      state.stocks[ticker].prevClose = dailyPrevPrice;
    } else if (state.stocks[ticker].prevClose !== undefined && state.stocks[ticker].prevClose !== null) {
      dailyPrevPrice = state.stocks[ticker].prevClose;
    } else {
      // Fallback for non-daily timeframes when prevClose is not yet cached:
      // use the second-to-latest close from the timeframe data as a temp value,
      // and trigger background daily fetch to calculate the correct prevClose.
      dailyPrevPrice = values.length > 1 ? parseFloat(values[values.length - 2].close) : currentPrice;
      fetchStockPriceInBackground(ticker);
    }
    const dailyChange = dailyPrevPrice ? ((currentPrice - dailyPrevPrice) / dailyPrevPrice) * 100 : 0;

    // Timeframe-specific change for chart header: latest close relative to the start of the selected timeframe
    const prevPrice = values[0] ? parseFloat(values[0].close) : currentPrice;
    const timeframeChange = prevPrice ? ((currentPrice - prevPrice) / prevPrice) * 100 : 0;

    const closes = [];
    const labels = [];

    values.forEach(item => {
      closes.push(parseFloat(parseFloat(item.close).toFixed(2)));

      const datetime = item.datetime;
      // datetime format is either "YYYY-MM-DD HH:MM:SS" (intraday) or "YYYY-MM-DD" (daily)
      if (state.selectedTimeframe === 'D' || state.selectedTimeframe === 'W') {
        const parts = datetime.split(' ');
        const timePart = parts[1] ? parts[1].substring(0, 5) : '';
        const datePart = parts[0];

        if (state.selectedTimeframe === 'D') {
          labels.push(timePart || datePart);
        } else {
          // Format as "Mon 14:00"
          const dateObj = new Date(datePart + 'T' + (parts[1] || '00:00:00'));
          labels.push(dateObj.toLocaleDateString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' }));
        }
      } else {
        const datePart = datetime.split(' ')[0];
        const dateObj = new Date(datePart + 'T00:00:00');
        if (state.selectedTimeframe === 'M') {
          labels.push(dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        } else {
          labels.push(dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }));
        }
      }
    });

    // Safely update state slot to avoid losing history or name
    if (!state.stocks[ticker]) {
      state.stocks[ticker] = {};
    }
    state.stocks[ticker].ticker = ticker;
    state.stocks[ticker].name = state.stocks[ticker].name || (ticker + ' Stock');
    state.stocks[ticker].price = currentPrice;
    state.stocks[ticker].change = dailyChange; // 1-day change for watchlist
    state.stocks[ticker].timeframeChange = timeframeChange; // period change for chart header
    state.stocks[ticker].liveCloses = closes;
    state.stocks[ticker].liveLabels = labels;
    state.stocks[ticker].liveRawValues = values; // Save real Twelve Data values!
    state.stocks[ticker].isLive = true;
    saveCachedStocks();

    if (!state.linesMap[ticker]) {
      state.linesMap[ticker] = [];
    }

  } catch (err) {
    const errorMsg = err.message || "";
    const isSymbolNotFound = errorMsg.toLowerCase().includes("not found") ||
      errorMsg.toLowerCase().includes("not valid") ||
      errorMsg.toLowerCase().includes("invalid symbol") ||
      errorMsg.toLowerCase().includes("does not exist") ||
      errorMsg.toLowerCase().includes("parameter symbol");

    const isPopular = STOCKS_METADATA.some(s => s.ticker === ticker);

    if (isSymbolNotFound && !isPopular) {
      console.warn(`Symbol "${ticker}" does not exist. Removing from watchlist.`, err);

      // 1. Remove from watchlist
      state.watchlist = state.watchlist.filter(t => t !== ticker);
      saveWatchlist();

      // 2. Clear from state.stocks
      delete state.stocks[ticker];

      // 3. Switch back active ticker
      if (state.activeTicker === ticker) {
        state.activeTicker = state.watchlist.length > 0 ? state.watchlist[0] : 'AAPL';
      }

      // 4. Show notification
      showNotification(`Ticker "${ticker}" does not exist on Twelve Data!`, 'error');

      // 5. Re-trigger load and render for safe active ticker
      await loadStockDataAndRender(state.activeTicker);
      renderStockList('');
      return;
    }

    console.warn(`Could not load Twelve Data for ${ticker}. Loading generated fallback mock data.`, err);

    // Safety check slot
    if (!state.stocks[ticker]) {
      state.stocks[ticker] = {};
    }

    // Rebuild mock history if it got lost
    if (!state.stocks[ticker].history) {
      const basePrice = STOCKS_METADATA.find(s => s.ticker === ticker)?.price || 150.00;
      state.stocks[ticker].ticker = ticker;
      state.stocks[ticker].name = state.stocks[ticker].name || (ticker + ' Stock');
      state.stocks[ticker].price = basePrice;
      state.stocks[ticker].history = {
        D: generateWalk(basePrice, 24, 'up', 0.005),
        W: generateWalk(basePrice, 7, 'up', 0.012),
        M: generateWalk(basePrice, 30, 'up', 0.015),
        Y: generateWalk(basePrice, 52, 'up', 0.025)
      };
    }

    // Set fallback active references
    state.stocks[ticker].liveCloses = state.stocks[ticker].history[state.selectedTimeframe];
    state.stocks[ticker].liveLabels = getTimeframeLabels(state.selectedTimeframe);

    // Calculate actual mock walk change relative to the start of the timeframe walk
    const closes = state.stocks[ticker].liveCloses || [];

    // Ensure the last element of the mock walk is exactly equal to the authoritative stock price
    if (closes.length > 0 && state.stocks[ticker].price !== undefined) {
      closes[closes.length - 1] = state.stocks[ticker].price;
    }

    const baseWalkPrice = closes[0] || state.stocks[ticker].price || 150.00;
    const currentWalkPrice = state.stocks[ticker].price || (closes.length > 0 ? closes[closes.length - 1] : baseWalkPrice);

    // 1-Day change (daily change) for watchlist sidebar: today's close relative to yesterday's close
    // We retrieve yesterday's close from the daily mock series (history['M']) to ensure it is always a true 1-day change
    const mCloses = state.stocks[ticker].history ? state.stocks[ticker].history['M'] : [];
    const yesterdayClose = mCloses && mCloses.length > 1 ? mCloses[mCloses.length - 2] : baseWalkPrice;
    const dailyChange = yesterdayClose ? ((currentWalkPrice - yesterdayClose) / yesterdayClose) * 100 : 0.35;

    // Timeframe-specific change for chart header: today's close relative to the start of the timeframe walk
    const timeframeChange = baseWalkPrice ? ((currentWalkPrice - baseWalkPrice) / baseWalkPrice) * 100 : 0;

    state.stocks[ticker].change = dailyChange; // 1-day change for watchlist
    state.stocks[ticker].timeframeChange = timeframeChange; // period change for chart header

    state.stocks[ticker].liveRawValues = null; // force regeneration of mock wicks in chart draw
    state.stocks[ticker].isLive = true;
    saveCachedStocks();
  } finally {
    if (chartContainer) chartContainer.classList.remove('loading');

    // Render chart and calculations
    renderStockChartDirect();
    updateDashboard();
  }
}

// 4. Chart Rendering
let mainChart = null;

const horizontalLinesPlugin = {
  id: 'horizontalLines',
  afterDraw(chart) {
    if (!state.showLevels) return; // Skip drawing S&R lines if toggled off

    const { ctx, chartArea: { left, right, top, bottom }, scales: { y } } = chart;
    const activeStock = state.stocks[state.activeTicker];
    if (!activeStock) return;

    const currentPrice = activeStock.price;
    const lines = state.linesMap[state.activeTicker] || [];

    ctx.save();

    // Draw Current Price Level (Reference line)
    const currentPriceY = y.getPixelForValue(currentPrice);
    if (currentPriceY >= top && currentPriceY <= bottom) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);

      ctx.beginPath();
      ctx.moveTo(left, currentPriceY);
      ctx.lineTo(right, currentPriceY);
      ctx.stroke();

      // Current Price Label Background (outside to the right of the chart area)
      ctx.fillStyle = 'rgba(10, 15, 30, 0.85)';
      ctx.fillRect(right + 5, currentPriceY - 10, 75, 20);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.87)';
      ctx.font = '700 10px var(--font-display)';
      ctx.fillText(`NOW: $${currentPrice.toFixed(2)}`, right + 10, currentPriceY + 4);
    }

    // Draw Support & Resistance User Lines
    lines.forEach(linePrice => {
      const lineY = y.getPixelForValue(linePrice);
      if (lineY >= top && lineY <= bottom) {
        const isResistance = linePrice > currentPrice;
        ctx.strokeStyle = isResistance ? '#f43f5e' : '#10b981';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);

        ctx.beginPath();
        ctx.moveTo(left, lineY);
        ctx.lineTo(right, lineY);
        ctx.stroke();

        // Level Tag Badge Background
        ctx.fillStyle = isResistance ? '#f43f5e' : '#10b981';
        const labelText = `${isResistance ? 'RES' : 'SUP'} $${linePrice.toFixed(2)}`;
        ctx.font = '700 11px var(--font-display)';
        const textWidth = ctx.measureText(labelText).width;

        ctx.beginPath();
        ctx.roundRect(left + 8, lineY - 11, textWidth + 12, 22, 6);
        ctx.fill();

        // Tag Text
        ctx.fillStyle = '#ffffff';
        ctx.fillText(labelText, left + 14, lineY + 4);
      }
    });

    // Draw Hover Guide Line
    if (state.hoverPrice !== null) {
      const hoverY = y.getPixelForValue(state.hoverPrice);
      if (hoverY >= top && hoverY <= bottom) {
        const isHoverResistance = state.hoverPrice > currentPrice;

        ctx.strokeStyle = isHoverResistance ? 'rgba(244, 63, 94, 0.4)' : 'rgba(16, 185, 129, 0.4)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);

        ctx.beginPath();
        ctx.moveTo(left, hoverY);
        ctx.lineTo(right, hoverY);
        ctx.stroke();

        // Draw cursor target preview tag
        ctx.fillStyle = isHoverResistance ? 'rgba(244, 63, 94, 0.9)' : 'rgba(16, 185, 129, 0.9)';
        const guideText = `Click to add ${isHoverResistance ? 'Resistance' : 'Support'} at $${state.hoverPrice.toFixed(2)}`;
        ctx.font = '600 10px var(--font-body)';
        const textWidth = ctx.measureText(guideText).width;

        ctx.beginPath();
        ctx.roundRect(left + 8, hoverY - 9, textWidth + 12, 18, 4);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.fillText(guideText, left + 14, hoverY + 3);
      }
    }

    ctx.restore();
  }
};

const candlestickWicksPlugin = {
  id: 'candlestickWicks',
  afterDatasetsDraw(chart) {
    if (state.chartType !== 'candle') return;

    const { ctx, scales: { y } } = chart;
    const meta = chart.getDatasetMeta(0);
    const activeStock = state.stocks[state.activeTicker];
    if (!activeStock || !activeStock.liveRawValues) return;

    // Slice raw values arrays to match our current zoom percentage to resolve index offset mismatches!
    const totalLength = activeStock.liveCloses.length;
    const visibleCount = Math.max(5, Math.round((totalLength * state.zoomLevel) / 100));
    const rawValues = activeStock.liveRawValues.slice(-visibleCount);

    ctx.save();
    meta.data.forEach((bar, index) => {
      const raw = rawValues[index];
      if (!raw) return;

      const high = parseFloat(raw.high);
      const low = parseFloat(raw.low);
      const close = parseFloat(raw.close);
      const open = parseFloat(raw.open);

      const isBullish = close >= open;
      ctx.strokeStyle = isBullish ? '#10b981' : '#f43f5e';
      ctx.lineWidth = 1.5;

      const highY = y.getPixelForValue(high);
      const lowY = y.getPixelForValue(low);
      const barX = bar.x;

      ctx.beginPath();
      ctx.moveTo(barX, highY);
      ctx.lineTo(barX, lowY);
      ctx.stroke();
    });
    ctx.restore();
  }
};

function renderStockChartDirect() {
  const canvasElement = document.getElementById('mainChart');
  if (!canvasElement) return;

  // Immediately destroy the old chart instance to prevent multiple charts overlaying on the same canvas
  if (mainChart) {
    mainChart.destroy();
    mainChart = null;
  }

  const ctx = canvasElement.getContext('2d');
  const activeStock = state.stocks[state.activeTicker];
  if (!activeStock) return;

  // Make sure raw values exist (generate fallback candles if mock generator or Twelve Data limits was active)
  if (!activeStock.liveRawValues || activeStock.liveRawValues.length === 0) {
    const closes = activeStock.liveCloses || [];
    const labels = activeStock.liveLabels || [];
    activeStock.liveRawValues = closes.map((c, idx) => {
      const prev = idx > 0 ? closes[idx - 1] : c * 0.985;
      const o = parseFloat(prev.toFixed(2));
      const cl = parseFloat(c.toFixed(2));
      const spread = Math.abs(cl - o) || c * 0.005;
      const h = parseFloat((Math.max(o, cl) + Math.random() * spread * 0.5).toFixed(2));
      const l = parseFloat((Math.min(o, cl) - Math.random() * spread * 0.5).toFixed(2));

      return {
        open: o,
        close: cl,
        high: h,
        low: l,
        datetime: labels[idx]
      };
    });
  }

  // --- INTERACTIVE TIMEFRAME & TIMELINE ZOOM SLICING ---
  const totalLength = activeStock.liveCloses.length;
  const visibleCount = Math.max(5, Math.round((totalLength * state.zoomLevel) / 100));

  const historyCloses = activeStock.liveCloses.slice(-visibleCount);
  const labels = activeStock.liveLabels.slice(-visibleCount);
  const rawValues = activeStock.liveRawValues.slice(-visibleCount);

  // --- DYNAMIC Y-AXIS AUTO-SCALING ---
  let minVal = 0;
  let maxVal = 0;

  if (state.chartType === 'candle') {
    minVal = Math.min(...rawValues.map(v => parseFloat(v.low)));
    maxVal = Math.max(...rawValues.map(v => parseFloat(v.high)));
  } else {
    minVal = Math.min(...historyCloses);
    maxVal = Math.max(...historyCloses);
  }

  const verticalSpread = maxVal - minVal;
  const marginPadding = verticalSpread * 0.2 || minVal * 0.03;

  const yMinBound = Math.max(0, parseFloat((minVal - marginPadding).toFixed(2)));
  const yMaxBound = parseFloat((maxVal + marginPadding).toFixed(2));

  const color = activeStock.change >= 0 ? '#10b981' : '#f43f5e';
  const glow = activeStock.change >= 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)';

  let datasetConfig = {};
  let chartType = 'line';

  if (state.chartType === 'candle') {
    chartType = 'bar';
    datasetConfig = {
      label: activeStock.ticker,
      // CRITICAL FIX: Ensure floating bars are always represented as [min, max] so Chart.js renders correctly!
      data: rawValues.map(v => [
        Math.min(parseFloat(v.open), parseFloat(v.close)),
        Math.max(parseFloat(v.open), parseFloat(v.close))
      ]),
      backgroundColor: rawValues.map(v => parseFloat(v.close) >= parseFloat(v.open) ? 'rgba(16, 185, 129, 0.75)' : 'rgba(244, 63, 94, 0.75)'),
      borderColor: rawValues.map(v => parseFloat(v.close) >= parseFloat(v.open) ? '#10b981' : '#f43f5e'),
      borderWidth: 1.5,
      borderSkipped: false,
      barPercentage: 0.65
    };
  } else {
    chartType = 'line';
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, glow);
    gradient.addColorStop(1, 'rgba(6, 9, 19, 0)');

    datasetConfig = {
      label: activeStock.ticker,
      data: historyCloses,
      borderColor: color,
      borderWidth: 2.5,
      backgroundColor: gradient,
      fill: true,
      tension: 0.35,
      pointRadius: 0, // Invisible by default
      pointHoverRadius: 8, // Enlarged glowing hover dot
      pointHoverBackgroundColor: color,
      pointHoverBorderColor: '#fff', // White glow border on hover
      pointHoverBorderWidth: 2.5, // Thick hover border
      pointHitRadius: 10 // Easily trigger hover dot visibility
    };
  }

  // Create the new chart in the next execution tick to allow the browser to complete
  // canvas destruction and trigger reflows. This avoids vertical/horizontal squeeze glitches.
  setTimeout(() => {
    const canvas = document.getElementById('mainChart');
    if (!canvas) return;
    const currentCtx = canvas.getContext('2d');

    mainChart = new Chart(currentCtx, {
      type: chartType,
      data: {
        labels: labels,
        datasets: [datasetConfig]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: {
            right: 85
          }
        },
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0d1426',
            titleFont: { family: 'Outfit', size: 12, weight: '700' },
            bodyFont: { family: 'Plus Jakarta Sans', size: 12 },
            borderColor: 'rgba(255,255,255,0.08)',
            borderWidth: 1,
            padding: 10,
            displayColors: false,
            callbacks: {
              label: function (context) {
                if (state.chartType === 'candle') {
                  const idx = context.dataIndex;
                  const rawObj = rawValues[idx];
                  if (rawObj) {
                    return [
                      `Open:  $${parseFloat(rawObj.open).toFixed(2)}`,
                      `High:  $${parseFloat(rawObj.high).toFixed(2)}`,
                      `Low:   $${parseFloat(rawObj.low).toFixed(2)}`,
                      `Close: $${parseFloat(rawObj.close).toFixed(2)}`
                    ];
                  }
                }
                return `Price: $${context.raw.toFixed(2)}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: '#b6bfd0ff',
              font: { family: 'Plus Jakarta Sans', size: 12 },
              maxTicksLimit: 8
            }
          },
          y: {
            position: 'right',
            grid: {
              color: 'rgba(255, 255, 255, 0.03)'
            },
            ticks: {
              color: '#b6bfd0ff',
              font: { family: 'Outfit', size: 13 },
              callback: function (value) {
                return '$' + value;
              }
            },
            min: yMinBound,
            max: yMaxBound
          }
        },
        onHover: (event, activeElements) => {
          if (!mainChart || !state.showLevels) return;
          const yValue = mainChart.scales.y.getValueForPixel(event.y);

          if (yValue !== undefined && yValue >= mainChart.scales.y.min && yValue <= mainChart.scales.y.max) {
            state.hoverPrice = parseFloat(yValue.toFixed(2));
            mainChart.draw();
          } else {
            state.hoverPrice = null;
          }
        }
      },
      plugins: [horizontalLinesPlugin, candlestickWicksPlugin]
    });

    // Attach click handler to draw horizontal support / resistance lines (only active if showLevels is true)
    canvas.onclick = (e) => {
      if (!mainChart || !state.showLevels) return;
      const yValue = mainChart.scales.y.getValueForPixel(e.offsetY);
      if (yValue !== undefined && yValue >= mainChart.scales.y.min && yValue <= mainChart.scales.y.max) {
        const clickedPrice = parseFloat(yValue.toFixed(2));

        const existingLines = state.linesMap[state.activeTicker] || [];
        const isDuplicate = existingLines.some(price => Math.abs(price - clickedPrice) < (activeStock.price * 0.003));

        if (!isDuplicate) {
          existingLines.push(clickedPrice);
          state.linesMap[state.activeTicker] = existingLines;
          saveSupportResistanceLines();
          updateDashboard();
        }
      }
    };
  }, 20);
}

// 5. Update UI, Badges, Calculations
function updateDashboard() {
  const activeStock = state.stocks[state.activeTicker];
  if (!activeStock) return;

  // Refresh the popular stock sidebar to display updated live prices (preserving search input)
  const searchInput = document.getElementById('stockSearch');
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  renderStockList(query);

  // Sync active portfolio statistics to show updated live prices immediately
  if (typeof updatePortfolioDashboard === 'function') {
    updatePortfolioDashboard();
  }

  // Update header labels
  document.getElementById('activeTicker').innerText = activeStock.ticker;
  document.getElementById('activeName').innerText = activeStock.name;
  document.getElementById('activePrice').innerText = `$${activeStock.price.toFixed(2)}`;

  const trendEl = document.getElementById('activeChange');
  const displayChange = activeStock.timeframeChange !== undefined ? activeStock.timeframeChange : activeStock.change;
  trendEl.innerText = `${displayChange >= 0 ? '+' : ''}${displayChange.toFixed(2)}%`;
  trendEl.className = `stock-trend ${displayChange >= 0 ? 'positive' : 'negative'}`;

  // Segregate supports vs resistances (only factor them if S&R overlay is toggled on)
  const lines = state.showLevels ? (state.linesMap[state.activeTicker] || []) : [];
  const currentPrice = activeStock.price;

  const supports = [];
  const resistances = [];

  lines.forEach(price => {
    if (price < currentPrice) {
      supports.push(price);
    } else {
      resistances.push(price);
    }
  });

  supports.sort((a, b) => b - a);
  resistances.sort((a, b) => a - b);

  // Indicators
  document.getElementById('totalLevelsCount').innerText = lines.length;
  document.getElementById('supportLevelsCount').innerText = supports.length;
  document.getElementById('resistanceLevelsCount').innerText = resistances.length;

  // Pills lists
  renderPills(supports, 'sup', 'supportPills');
  renderPills(resistances, 'res', 'resistancePills');

  // Calculations matrix table
  renderCalculationsTable(supports, resistances);

  if (mainChart) {
    mainChart.draw();
  }
}

function renderPills(levels, type, containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  if (levels.length === 0) {
    container.innerHTML = `<li class="empty-pill-msg">No ${type === 'sup' ? 'support' : 'resistance'} lines set. Click on chart.</li>`;
    return;
  }

  levels.forEach(price => {
    const pill = document.createElement('li');
    pill.className = `level-pill ${type}`;
    pill.innerHTML = `
      <span>$${price.toFixed(2)}</span>
      <button class="pill-delete-btn" data-price="${price}"><i class="fa-solid fa-trash"></i></button>
    `;

    pill.querySelector('.pill-delete-btn').onclick = (e) => {
      e.stopPropagation();
      const deletePrice = parseFloat(e.currentTarget.getAttribute('data-price'));
      const activeLines = state.linesMap[state.activeTicker] || [];
      state.linesMap[state.activeTicker] = activeLines.filter(p => p !== deletePrice);
      saveSupportResistanceLines();
      updateDashboard();
    };

    container.appendChild(pill);
  });
}

function renderCalculationsTable(supports, resistances) {
  const table = document.getElementById('projectionTable');
  const emptyState = document.getElementById('emptyMatrixState');
  table.innerHTML = '';

  const capitalLabel = document.getElementById('matrixCapitalLabel');
  if (capitalLabel) {
    capitalLabel.innerText = `$${state.currentCapital.toLocaleString()}`;
  }
  const capitalInput = document.getElementById('globalCapital');
  if (capitalInput && document.activeElement !== capitalInput) {
    capitalInput.value = state.currentCapital;
  }

  // Check levels sizes
  if (supports.length === 0 || resistances.length === 0) {
    emptyState.style.display = 'flex';
    table.style.display = 'none';
    return;
  }

  emptyState.style.display = 'none';
  table.style.display = 'table';

  // Sort: Supports Descending, Resistances Ascending
  supports.sort((a, b) => b - a);
  resistances.sort((a, b) => a - b);

  // Generate dynamic table header (thead)
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  const cornerCell = document.createElement('th');
  cornerCell.innerHTML = 'SUP \\ RES';
  headerRow.appendChild(cornerCell);

  resistances.forEach(res => {
    const th = document.createElement('th');
    th.className = 'price-label-res';
    th.innerText = `$${res.toFixed(2)}`;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Generate dynamic table body (tbody)
  const tbody = document.createElement('tbody');

  supports.forEach(sup => {
    const tr = document.createElement('tr');

    // Row support header
    const rowHeader = document.createElement('td');
    rowHeader.className = 'price-label-sup';
    rowHeader.innerText = `$${sup.toFixed(2)}`;
    tr.appendChild(rowHeader);

    // Compute cell figures
    resistances.forEach(res => {
      const td = document.createElement('td');

      if (sup < res) {
        const roi = ((res - sup) / sup) * 100;
        const estProfit = (state.currentCapital / sup) * (res - sup);

        td.innerHTML = `
          <span class="matrix-cell-profit">+$${estProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          <span class="matrix-cell-roi">+${roi.toFixed(2)}%</span>
        `;
      } else {
        td.innerHTML = `<span class="matrix-cell-invalid">—</span>`;
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
}

// 6. Setup Listeners
function setupCoreEventListeners() {
  const tfButtons = document.querySelectorAll('.tf-btn');
  tfButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      tfButtons.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      state.selectedTimeframe = e.target.getAttribute('data-tf');

      // Load live data for the active ticker with the new timeframe
      loadStockDataAndRender(state.activeTicker);
    });
  });

  const styleButtons = document.querySelectorAll('.style-btn');
  styleButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      styleButtons.forEach(b => b.classList.remove('active'));
      const target = e.currentTarget;
      target.classList.add('active');
      state.chartType = target.getAttribute('data-style');

      // Fast refresh chart draw
      renderStockChartDirect();
    });
  });

  const searchInput = document.getElementById('stockSearch');
  const clearSearchBtn = document.getElementById('clearSearch');

  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    clearSearchBtn.style.display = query.length > 0 ? 'block' : 'none';
    renderStockList(query);
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearSearchBtn.style.display = 'none';
    renderStockList('');
    searchInput.focus();
  });

  document.getElementById('clearAllLines').onclick = () => {
    state.linesMap[state.activeTicker] = [];
    saveSupportResistanceLines();
    updateDashboard();
  };

  const capitalInput = document.getElementById('globalCapital');
  capitalInput.addEventListener('input', (e) => {
    let val = parseFloat(e.target.value);
    if (isNaN(val) || val <= 0) val = 100;
    state.currentCapital = val;
    updateDashboard();
  });

  // Toggle S&R Overlay Switch
  const toggleSR = document.getElementById('toggleSR');
  toggleSR.addEventListener('change', (e) => {
    state.showLevels = e.target.checked;
    updateDashboard();
  });

  // Zoom range slider
  const zoomSlider = document.getElementById('zoomSlider');
  const zoomLabel = document.getElementById('zoomLabel');
  zoomSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    state.zoomLevel = val;
    zoomLabel.innerText = `${val}%`;
    renderStockChartDirect();
  });
}

// Watchlist removal helper
async function removeStockFromWatchlist(ticker) {
  state.watchlist = state.watchlist.filter(t => t !== ticker);
  saveWatchlist();

  if (state.activeTicker === ticker) {
    if (state.watchlist.length > 0) {
      state.activeTicker = state.watchlist[0];
      await loadStockDataAndRender(state.activeTicker);
    } else {
      state.activeTicker = 'AAPL';
      await loadStockDataAndRender('AAPL');
    }
  }

  const searchInput = document.getElementById('stockSearch');
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  renderStockList(query);
}

// 7. Render Left Stock selection
function renderStockList(query = '') {
  const stockList = document.getElementById('stockList');
  if (!stockList) return;
  stockList.innerHTML = '';

  const filteredTickers = state.watchlist.filter(ticker => {
    const stock = state.stocks[ticker];
    if (!stock) return false;
    return ticker.toLowerCase().includes(query) ||
      (stock.name && stock.name.toLowerCase().includes(query));
  });

  filteredTickers.forEach(ticker => {
    const stock = state.stocks[ticker];
    if (!stock) return;

    const li = document.createElement('li');
    li.className = `stock-item ${ticker === state.activeTicker ? 'active' : ''}`;

    const isUp = stock.change >= 0;

    const priceText = stock.isLive ? `$${stock.price.toFixed(2)}` : '...';
    const changeHTML = stock.isLive
      ? `<span class="stock-item-change ${isUp ? 'up' : 'down'}">${isUp ? '+' : ''}${stock.change.toFixed(2)}%</span>`
      : `<span class="stock-item-change" style="opacity: 0.5; color: var(--text-muted); background: rgba(255, 255, 255, 0.03); padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600;">Loading...</span>`;

    li.innerHTML = `
      <div class="stock-item-info">
        <span class="stock-item-ticker">${stock.ticker}</span>
        <span class="stock-item-name">${stock.name}</span>
      </div>
      <div class="stock-item-right-wrapper">
        <div class="stock-item-stats">
          <span class="stock-item-price">${priceText}</span>
          ${changeHTML}
        </div>
        <button class="btn-watchlist-remove" title="Remove from watchlist" aria-label="Remove ${stock.ticker} from watchlist">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
    `;

    li.onclick = () => {
      state.activeTicker = stock.ticker;
      document.querySelectorAll('.stock-item').forEach(el => el.classList.remove('active'));
      li.classList.add('active');

      // Async trigger fetch and redraw
      loadStockDataAndRender(stock.ticker);
    };

    const removeBtn = li.querySelector('.btn-watchlist-remove');
    if (removeBtn) {
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        removeStockFromWatchlist(stock.ticker);
      };
    }

    stockList.appendChild(li);
  });

  const exactMatchInWatchlist = state.watchlist.some(ticker => ticker.toLowerCase() === query);
  if (query.length > 0 && !exactMatchInWatchlist) {
    const addLi = document.createElement('li');
    addLi.className = 'stock-item add-custom-item';
    addLi.innerHTML = `
      <div class="stock-item-info">
        <span class="stock-item-ticker" style="color: var(--cyan);"><i class="fa-solid fa-circle-plus"></i> Add '${query.toUpperCase()}'</span>
        <span class="stock-item-name">Add to your active watchlist</span>
      </div>
      <div class="stock-item-stats">
        <span class="stock-item-price" style="font-size: 11px; opacity: 0.6;">Fetch Live</span>
      </div>
    `;

    addLi.onclick = async () => {
      const ticker = query.toUpperCase();

      if (!state.watchlist.includes(ticker)) {
        state.watchlist.push(ticker);
        saveWatchlist();
      }

      if (!state.stocks[ticker]) {
        state.stocks[ticker] = {
          ticker: ticker,
          name: ticker + ' Stock',
          price: 0.0,
          change: 0.0,
          trend: 'up'
        };
      }

      state.activeTicker = ticker;

      const searchInput = document.getElementById('stockSearch');
      const clearSearchBtn = document.getElementById('clearSearch');
      if (searchInput) searchInput.value = '';
      if (clearSearchBtn) clearSearchBtn.style.display = 'none';

      await loadStockDataAndRender(ticker);
      renderStockList('');
    };

    stockList.appendChild(addLi);
  }
}

// 8. Top Ticker Loop Tape
function renderTickerTape() {
  const tape = document.getElementById('tickerTape');
  tape.innerHTML = '';

  const tapeData = [...STOCKS_METADATA, ...STOCKS_METADATA];

  tapeData.forEach(item => {
    const div = document.createElement('div');
    div.className = 'ticker-item';
    const isUp = item.change >= 0;

    div.innerHTML = `
      <span class="ticker-name">${item.ticker}</span>
      <span class="ticker-price">$${item.price.toFixed(2)}</span>
      <span class="ticker-change ${isUp ? 'up' : 'down'}">
        ${isUp ? '▲' : '▼'} ${Math.abs(item.change)}%
      </span>
    `;

    div.onclick = () => {
      state.activeTicker = item.ticker;
      renderStockList('');
      loadStockDataAndRender(item.ticker);
    };

    tape.appendChild(div);
  });
}

// Background fetch helper to keep popular stock list prices up to date without interrupting active chart
async function fetchStockPriceInBackground(ticker) {
  try {
    const response = await fetch(`/api/stock?ticker=${ticker}&timeframe=M`);
    if (!response.ok) return;
    const json = await response.json();
    if (json.status !== 'ok') return;

    const values = json.values || [];
    if (values.length === 0) return;

    const currentPrice = parseFloat(values[values.length - 1].close);
    const prevPrice = values.length > 1 ? parseFloat(values[values.length - 2].close) : currentPrice;
    const change = prevPrice ? ((currentPrice - prevPrice) / prevPrice) * 100 : 0;

    if (!state.stocks[ticker]) {
      state.stocks[ticker] = {};
    }
    state.stocks[ticker].ticker = ticker;
    state.stocks[ticker].price = currentPrice;
    state.stocks[ticker].prevClose = prevPrice;
    state.stocks[ticker].change = change;
    state.stocks[ticker].isLive = true;
    saveCachedStocks();

    // Refresh sidebar list
    const searchInput = document.getElementById('stockSearch');
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    renderStockList(query);

    // Sync active portfolio statistics to show updated live prices immediately
    if (typeof updatePortfolioDashboard === 'function') {
      updatePortfolioDashboard();
    }
  } catch (err) {
    console.warn(`Background fetch failed for ${ticker}:`, err);
  }
}

// 9. Init Workspace
window.addEventListener('DOMContentLoaded', () => {
  loadWatchlist();
  seedMockDatabase();
  loadCachedStocks(); // Overwrite mock seeds with cached live records!
  loadSupportResistanceLines(); // Restore all cached Support & Resistance lines!
  renderTickerTape();
  renderStockList();
  setupCoreEventListeners();

  // Setup mouse leave canvas safety state reset
  const canvasElement = document.getElementById('mainChart');
  if (canvasElement) {
    canvasElement.addEventListener('mouseleave', () => {
      state.hoverPrice = null;
      if (mainChart) {
        mainChart.draw();
      }
    });
  }

  // Load first active stock live from Twelve Data
  loadStockDataAndRender(state.activeTicker);

  // Stagger background loads for all other watchlist assets to keep their prices fully up to date
  const otherTickers = state.watchlist.filter(t => t !== state.activeTicker);
  otherTickers.forEach((ticker, index) => {
    setTimeout(() => {
      // Check that it's still not the active ticker and is still in watchlist before loading
      if (ticker !== state.activeTicker && state.watchlist.includes(ticker)) {
        fetchStockPriceInBackground(ticker);
      }
    }, (index + 1) * 2000); // 2 second delay between queries to perfectly stagger within Twelve Data limits
  });

  // Initialize Portfolio Manager Engine
  initPortfolio();
});

// ==========================================================================
// 10. PORTFOLIO MANAGEMENT ENGINE (LIVE SYNC & LOCALSTORAGE PERSISTED)
// ==========================================================================

let portfoliosList = []; // Array of { id, name, holdings, transactions, realizedPL }
let activePortfolioId = 'default';

const portfolioState = {
  holdings: {}, // Ticker -> { shares: X, avgCost: Y }
  transactions: [],
  selectedTicker: null, // Ticker selected in portfolio search
  realizedPL: 0
};

// Load Portfolios from LocalStorage (with backward-compatible migration for existing portfolios!)
function loadPortfolioFromStorage() {
  const storedList = localStorage.getItem('aethertrade_portfolios_list');
  const storedActiveId = localStorage.getItem('aethertrade_active_portfolio_id');
  const storedOldSingle = localStorage.getItem('aethertrade_portfolio');

  try {
    if (storedList) {
      portfoliosList = JSON.parse(storedList);
    } else {
      // Migrate old single portfolio if present, otherwise initialize empty Primary Portfolio
      let oldHoldings = {};
      let oldTransactions = [];
      let oldRealizedPL = 0;

      if (storedOldSingle) {
        const oldData = JSON.parse(storedOldSingle);
        oldHoldings = oldData.holdings || {};
        oldTransactions = oldData.transactions || [];
        oldRealizedPL = oldData.realizedPL || 0;
      }

      portfoliosList = [{
        id: 'default',
        name: 'Primary Portfolio',
        holdings: oldHoldings,
        transactions: oldTransactions,
        realizedPL: oldRealizedPL
      }];
      
      localStorage.setItem('aethertrade_portfolios_list', JSON.stringify(portfoliosList));
    }

    activePortfolioId = storedActiveId || 'default';
    
    // Ensure active ID exists in the loaded list
    let active = portfoliosList.find(p => p.id === activePortfolioId);
    if (!active) {
      active = portfoliosList[0] || { id: 'default', name: 'Primary Portfolio', holdings: {}, transactions: [], realizedPL: 0 };
      activePortfolioId = active.id;
    }

    // Sync active portfolio details to the global portfolioState
    portfolioState.holdings = active.holdings || {};
    portfolioState.transactions = active.transactions || [];
    portfolioState.realizedPL = active.realizedPL || 0;
    portfolioState.selectedTicker = null;

  } catch (e) {
    console.error("Failed to load portfolios from storage", e);
    // Safe fallbacks
    portfoliosList = [{ id: 'default', name: 'Primary Portfolio', holdings: {}, transactions: [], realizedPL: 0 }];
    activePortfolioId = 'default';
    portfolioState.holdings = {};
    portfolioState.transactions = [];
    portfolioState.realizedPL = 0;
  }
}

// Save active state into portfoliosList and write to LocalStorage
function savePortfolioToStorage() {
  const active = portfoliosList.find(p => p.id === activePortfolioId);
  if (active) {
    active.holdings = portfolioState.holdings;
    active.transactions = portfolioState.transactions;
    active.realizedPL = portfolioState.realizedPL;
  }
  
  localStorage.setItem('aethertrade_portfolios_list', JSON.stringify(portfoliosList));
  localStorage.setItem('aethertrade_active_portfolio_id', activePortfolioId);
}

// Create a new named portfolio
function createNewPortfolio(name) {
  if (!name || name.trim() === '') return;
  const cleanName = name.trim();
  
  // Check if name already exists to prevent duplicate names
  if (portfoliosList.some(p => p.name.toLowerCase() === cleanName.toLowerCase())) {
    showNotification(`A portfolio named "${cleanName}" already exists!`, 'error');
    return;
  }

  const newId = 'portfolio_' + Date.now();
  const newPortfolio = {
    id: newId,
    name: cleanName,
    holdings: {},
    transactions: [],
    realizedPL: 0
  };

  portfoliosList.push(newPortfolio);
  activePortfolioId = newId;

  // Sync to active state
  portfolioState.holdings = {};
  portfolioState.transactions = [];
  portfolioState.realizedPL = 0;
  portfolioState.selectedTicker = null;

  savePortfolioToStorage();
  
  // Re-render UI
  updatePortfolioSelectorDropdown();
  updatePortfolioDashboard();
  showNotification(`Created portfolio "${cleanName}" successfully!`, 'success');
}

// Delete the currently active portfolio
function deleteCurrentPortfolio() {
  if (portfoliosList.length <= 1) {
    showNotification("You must keep at least one portfolio!", "error");
    return;
  }

  const active = portfoliosList.find(p => p.id === activePortfolioId);
  const activeName = active ? active.name : "this portfolio";

  const confirmDelete = confirm(`Are you sure you want to permanently delete the portfolio "${activeName}"?\nThis will erase all its holdings and transaction logs.`);
  if (!confirmDelete) return;

  // Filter out the active portfolio
  portfoliosList = portfoliosList.filter(p => p.id !== activePortfolioId);

  // Set the new active portfolio to the first remaining one
  activePortfolioId = portfoliosList[0].id;
  const newActive = portfoliosList[0];

  // Sync to active state
  portfolioState.holdings = newActive.holdings || {};
  portfolioState.transactions = newActive.transactions || [];
  portfolioState.realizedPL = newActive.realizedPL || 0;
  portfolioState.selectedTicker = null;

  savePortfolioToStorage();

  // Re-render UI
  updatePortfolioSelectorDropdown();
  updatePortfolioDashboard();
  showNotification(`Deleted portfolio "${activeName}" successfully.`, "success");
}

// Populate the portfolio dropdown selector dynamically
function updatePortfolioSelectorDropdown() {
  const selector = document.getElementById('portfolioSelector');
  if (!selector) return;

  selector.innerHTML = '';
  portfoliosList.forEach(p => {
    const option = document.createElement('option');
    option.value = p.id;
    option.textContent = p.name;
    option.selected = (p.id === activePortfolioId);
    selector.appendChild(option);
  });
}

// Format currency helper
function formatCurrency(val) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
}

// Calculate unrealized gain/loss and details for each holding, then update UI
function updatePortfolioDashboard() {
  const tableBody = document.getElementById('portfolioTableBody');
  const emptyState = document.getElementById('emptyPortfolioState');
  const allocationContainer = document.getElementById('portfolioAllocationContainer');
  const logList = document.getElementById('portfolioLogList');

  if (!tableBody || !allocationContainer || !logList) return;

  tableBody.innerHTML = '';
  allocationContainer.innerHTML = '';
  logList.innerHTML = '';

  let totalAssetValue = 0;
  let totalCostBasis = 0;

  // Render Active Holdings rows
  const holdingTickers = Object.keys(portfolioState.holdings);

  if (holdingTickers.length === 0) {
    emptyState.style.display = 'flex';
    document.getElementById('portfolioTable').style.display = 'none';
  } else {
    emptyState.style.display = 'none';
    document.getElementById('portfolioTable').style.display = 'table';

    holdingTickers.forEach(ticker => {
      const holding = portfolioState.holdings[ticker];
      const metadata = state.stocks[ticker] || STOCKS_METADATA.find(s => s.ticker === ticker) || { price: holding.avgCost, change: 0, name: ticker + ' Stock' };
      const currentPrice = metadata.price || holding.avgCost; // Fallback to avgCost if not loaded yet

      const totalCost = holding.shares * holding.avgCost;
      const marketValue = holding.shares * currentPrice;
      const pnlVal = marketValue - totalCost;
      const pnlPct = totalCost > 0 ? (pnlVal / totalCost) * 100 : 0;

      totalAssetValue += marketValue;
      totalCostBasis += totalCost;

      const isProfit = pnlVal >= 0;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight: 800; font-family: var(--font-display); color: var(--cyan);">${ticker} <span style="font-size: 10px; color: var(--text-muted); font-weight: 400; display: block;">${metadata.name || ''}</span></td>
        <td style="font-weight: 700;">${holding.shares}</td>
        <td>${formatCurrency(holding.avgCost)}</td>
        <td style="font-weight: 700; color: #fff;">${formatCurrency(currentPrice)}</td>
        <td>${formatCurrency(totalCost)}</td>
        <td style="font-weight: 700; color: var(--cyan);">${formatCurrency(marketValue)}</td>
        <td style="font-weight: 700; color: ${isProfit ? 'var(--bullish)' : 'var(--bearish)'};">
          ${isProfit ? '+' : ''}${formatCurrency(pnlVal)}
          <span style="font-size: 10px; display: block; font-weight: 500;">(${isProfit ? '+' : ''}${pnlPct.toFixed(2)}%)</span>
        </td>
        <td style="text-align: center;">
          <button class="btn btn-tx-sell-all" data-ticker="${ticker}" style="background: rgba(244, 63, 94, 0.1); border: 1px solid rgba(244, 63, 94, 0.2); color: var(--bearish); padding: 4px 8px; font-size: 10px; border-radius: 4px; cursor: pointer; transition: all var(--transition-fast);">
            Sell All
          </button>
        </td>
      `;

      // Bind Sell All Action
      tr.querySelector('.btn-tx-sell-all').onclick = () => {
        executeTransaction(ticker, 'SELL', holding.shares, currentPrice);
      };

      tableBody.appendChild(tr);
    });
  }

  // Overall Portfolio Summary Computations
  const netProfit = totalAssetValue - totalCostBasis;
  const netReturnPct = totalCostBasis > 0 ? (netProfit / totalCostBasis) * 100 : 0;

  document.getElementById('portMarketVal').innerText = formatCurrency(totalAssetValue);
  document.getElementById('portCostBasis').innerText = formatCurrency(totalCostBasis);

  // Update Realized Profit / Loss summary card
  const realizedPLEl = document.getElementById('portRealizedPL');
  if (realizedPLEl) {
    const rPL = portfolioState.realizedPL || 0;
    const rIsPositive = rPL >= 0;
    realizedPLEl.innerText = `${rIsPositive ? '+' : ''}${formatCurrency(rPL)}`;
    realizedPLEl.className = `metric-val ${rPL === 0 ? '' : (rIsPositive ? 'text-green' : 'text-red')}`;

    const realizedCard = document.getElementById('portRealizedCard');
    if (realizedCard) {
      if (rPL > 0) {
        realizedCard.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        realizedCard.style.background = 'rgba(16, 185, 129, 0.01)';
      } else if (rPL < 0) {
        realizedCard.style.borderColor = 'rgba(244, 63, 94, 0.3)';
        realizedCard.style.background = 'rgba(244, 63, 94, 0.01)';
      } else {
        realizedCard.style.borderColor = 'var(--border-color)';
        realizedCard.style.background = 'rgba(255, 255, 255, 0.02)';
      }
    }
  }

  const profitLossEl = document.getElementById('portProfitLoss');
  const returnIsPositive = netProfit >= 0;
  profitLossEl.innerText = `${returnIsPositive ? '+' : ''}${formatCurrency(netProfit)}`;
  profitLossEl.className = `metric-val ${returnIsPositive ? 'text-green' : 'text-red'}`;

  // Highlight positive/negative returns on summary card border glow
  const profitCard = document.getElementById('portProfitCard');
  if (profitCard) {
    if (netProfit > 0) {
      profitCard.style.borderColor = 'rgba(16, 185, 129, 0.3)';
      profitCard.style.background = 'rgba(16, 185, 129, 0.01)';
    } else if (netProfit < 0) {
      profitCard.style.borderColor = 'rgba(244, 63, 94, 0.3)';
      profitCard.style.background = 'rgba(244, 63, 94, 0.01)';
    } else {
      profitCard.style.borderColor = 'var(--border-color)';
      profitCard.style.background = 'rgba(255, 255, 255, 0.02)';
    }
  }

  const returnEl = document.getElementById('portReturnPct');
  if (returnEl) {
    returnEl.innerText = `${returnIsPositive ? '+' : ''}${netReturnPct.toFixed(2)}%`;
    returnEl.className = `metric-val ${returnIsPositive ? 'text-green' : 'text-red'}`;
  }

  const returnCard = document.getElementById('portReturnCard');
  if (returnCard) {
    if (netProfit > 0) {
      returnCard.style.borderColor = 'rgba(16, 185, 129, 0.3)';
      returnCard.style.background = 'rgba(16, 185, 129, 0.01)';
    } else if (netProfit < 0) {
      returnCard.style.borderColor = 'rgba(244, 63, 94, 0.3)';
      returnCard.style.background = 'rgba(244, 63, 94, 0.01)';
    } else {
      returnCard.style.borderColor = 'var(--border-color)';
      returnCard.style.background = 'rgba(255, 255, 255, 0.02)';
    }
  }

  // Render Allocation progress bars
  if (holdingTickers.length === 0) {
    allocationContainer.innerHTML = `<div class="empty-pill-msg" style="text-align: center; margin-top: 20px;">No holdings active yet. Record a transaction to view allocation distribution.</div>`;
  } else {
    holdingTickers.forEach(ticker => {
      const holding = portfolioState.holdings[ticker];
      const metadata = state.stocks[ticker] || STOCKS_METADATA.find(s => s.ticker === ticker) || { price: holding.avgCost };
      const currentPrice = metadata.price || holding.avgCost;
      const marketValue = holding.shares * currentPrice;
      const allocationPct = totalAssetValue > 0 ? (marketValue / totalAssetValue) * 100 : 0;

      const barWrapper = document.createElement('div');
      barWrapper.className = 'allocation-bar-wrapper';
      barWrapper.innerHTML = `
        <div class="allocation-bar-header">
          <span class="allocation-bar-ticker">${ticker}</span>
          <span style="font-size: 11px; color: var(--text-muted);">${holding.shares} shares @ ${formatCurrency(currentPrice)}</span>
          <span class="allocation-bar-pct">${allocationPct.toFixed(1)}%</span>
        </div>
        <div class="allocation-bar-track">
          <div class="allocation-bar-fill" style="width: ${allocationPct}%"></div>
        </div>
      `;
      allocationContainer.appendChild(barWrapper);
    });
  }

  // Trigger Pie/Donut Chart Allocation Rendering
  renderAllocationChart(holdingTickers, totalAssetValue);

  // Trigger Unrealized Performance Chart Rendering
  renderPerformanceChart();

  // Render Transaction Logs
  if (portfolioState.transactions.length === 0) {
    logList.innerHTML = `<li class="empty-pill-msg" style="text-align: center; padding-top: 15px;">No transactions recorded.</li>`;
  } else {
    // Show newest first
    const reversedTx = [...portfolioState.transactions].reverse();
    reversedTx.forEach((tx, idx) => {
      const li = document.createElement('li');
      li.className = 'tx-log-item';

      const txDate = new Date(tx.timestamp);
      const isMidnight = txDate.getHours() === 0 && txDate.getMinutes() === 0 && txDate.getSeconds() === 0 && txDate.getMilliseconds() === 0;
      const dateStr = isMidnight
        ? txDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
        : txDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + txDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      li.innerHTML = `
        <div>
          <span class="type-badge ${tx.type.toLowerCase()}">${tx.type}</span>
          <strong>${tx.shares} ${tx.ticker}</strong> @ ${formatCurrency(tx.price)}
          <span style="font-size: 10px; color: var(--text-muted); display: block; margin-top: 2px;">Value: ${formatCurrency(tx.shares * tx.price)}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="tx-time">${dateStr}</span>
          <button class="btn-tx-delete" data-index="${portfolioState.transactions.length - 1 - idx}" title="Delete transaction entry"><i class="fa-solid fa-xmark"></i></button>
        </div>
      `;

      li.querySelector('.btn-tx-delete').onclick = (e) => {
        const deleteIdx = parseInt(e.currentTarget.getAttribute('data-index'));
        deleteTransactionEntry(deleteIdx);
      };

      logList.appendChild(li);
    });
  }
}

// Dynamic Stock Allocation Donut Chart instance
let portfolioAllocationChartInstance = null;

function renderAllocationChart(holdingTickers, totalAssetValue) {
  const canvas = document.getElementById('portfolioAllocationChart');
  const container = document.getElementById('allocationChartContainer');
  const emptyMsg = document.getElementById('allocationEmptyMsg');

  if (!canvas || !container || !emptyMsg) return;

  if (holdingTickers.length === 0 || totalAssetValue === 0) {
    canvas.style.display = 'none';
    emptyMsg.style.display = 'block';
    if (portfolioAllocationChartInstance) {
      portfolioAllocationChartInstance.destroy();
      portfolioAllocationChartInstance = null;
    }
    return;
  }

  canvas.style.display = 'block';
  emptyMsg.style.display = 'none';

  const labels = [];
  const data = [];

  holdingTickers.forEach(ticker => {
    const holding = portfolioState.holdings[ticker];
    const metadata = state.stocks[ticker] || STOCKS_METADATA.find(s => s.ticker === ticker) || { price: holding.avgCost };
    const currentPrice = metadata.price || holding.avgCost;
    const marketValue = holding.shares * currentPrice;
    labels.push(ticker);
    data.push(parseFloat(marketValue.toFixed(2)));
  });

  const baseColors = [
    '#00f0ff', // Neon cyan
    '#8b5cf6', // Indigo violet
    '#10b981', // Emerald green
    '#f43f5e', // Rose red
    '#f59e0b', // Amber orange
    '#ec4899'  // Neon pink
  ];

  if (portfolioAllocationChartInstance) {
    portfolioAllocationChartInstance.destroy();
  }

  const ctx = canvas.getContext('2d');
  portfolioAllocationChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: baseColors.slice(0, labels.length),
        borderColor: 'rgba(6, 9, 19, 0.8)', // Deep dark border matching background
        borderWidth: 2,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false // Muted legend, progress bars are used instead!
        },
        tooltip: {
          backgroundColor: 'rgba(13, 20, 38, 0.95)',
          titleColor: '#00f0ff',
          bodyColor: '#fff',
          borderColor: 'rgba(0, 240, 255, 0.2)',
          borderWidth: 1,
          titleFont: { family: 'Outfit', weight: '700', size: 12 },
          bodyFont: { family: 'Outfit', size: 11 },
          padding: 8,
          cornerRadius: 6,
          displayColors: false,
          callbacks: {
            label: function (context) {
              const val = context.parsed;
              const pct = (val / totalAssetValue) * 100;
              return ` ${context.label}: $${val.toLocaleString('en-US', { minimumFractionDigits: 2 })} (${pct.toFixed(1)}%)`;
            }
          }
        }
      },
      cutout: '70%' // modern slim donut cutout
    }
  });
}

// Dynamic Stock Unrealized Performance Line Chart instance
let portfolioPerformanceChartInstance = null;

function renderPerformanceChart() {
  try {
    const canvas = document.getElementById('portfolioPerformanceChart');
    const container = document.getElementById('performanceChartContainer');
    const emptyMsg = document.getElementById('performanceEmptyMsg');

    if (!canvas || !container || !emptyMsg) return;

    const txs = [...portfolioState.transactions];
    const activeTickers = Object.keys(portfolioState.holdings).filter(t => portfolioState.holdings[t].shares > 0);

    if (activeTickers.length === 0) {
      canvas.style.visibility = 'hidden';
      canvas.style.opacity = 0;
      emptyMsg.style.display = 'block';
      if (portfolioPerformanceChartInstance) {
        portfolioPerformanceChartInstance.destroy();
        portfolioPerformanceChartInstance = null;
      }
      return;
    }

    canvas.style.visibility = 'visible';
    canvas.style.opacity = 1;
    emptyMsg.style.display = 'none';

    // Find the earliest BUY transaction for any currently active ticker
    let earliestActiveTimestamp = Infinity;
    txs.forEach(tx => {
      if (tx.type === 'BUY' && activeTickers.includes(tx.ticker)) {
        if (tx.timestamp < earliestActiveTimestamp) {
          earliestActiveTimestamp = tx.timestamp;
        }
      }
    });

    if (earliestActiveTimestamp === Infinity) {
      earliestActiveTimestamp = txs[0] ? txs[0].timestamp : Date.now();
    }

    // Determine startDate and endDate (Today is always the rightmost boundary!)
    const startDate = new Date(earliestActiveTimestamp);
    const endDate = new Date();

    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);

    // If startDate is in the future relative to today, cap it at today
    if (startDate > endDate) {
      startDate.setTime(endDate.getTime());
    }

    // Calculate the difference in days
    const diffTime = Math.abs(endDate - startDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // Determine interval: daily step (diffDays <= 30) or weekly step (diffDays > 30)
    const stepDays = (diffDays <= 30) ? 1 : 7;
    const stepMs = stepDays * 24 * 60 * 60 * 1000;

    // Generate simulated timeline dates from startDate to endDate
    const timelineDates = [];
    let currentSimDate = new Date(startDate.getTime());
    while (currentSimDate <= endDate) {
      timelineDates.push(new Date(currentSimDate.getTime()));
      currentSimDate.setTime(currentSimDate.getTime() + stepMs);
    }

    // Ensure today (endDate) is always exactly the last date in the timeline
    if (timelineDates.length === 0 || timelineDates[timelineDates.length - 1].getTime() !== endDate.getTime()) {
      timelineDates.push(new Date(endDate.getTime()));
    }

    // Performance points array
    const points = [];

    // Helper to get historical closing price of a stock on a specific date from cache
    function getPriceOnDate(ticker, targetDate, fallbackPrice) {
      const stock = state.stocks[ticker];
      if (stock && stock.liveCloses && stock.liveCloses.length > 0) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const compareDate = new Date(targetDate.getTime());
        compareDate.setHours(0, 0, 0, 0);

        if (compareDate.getTime() === today.getTime()) {
          return parseFloat(stock.price) || parseFloat(stock.liveCloses[stock.liveCloses.length - 1]) || fallbackPrice;
        }

        // Try exact match in labels first (works for real Twelve Data dates)
        if (stock.liveLabels && stock.liveLabels.length === stock.liveCloses.length) {
          let exactIndex = -1;
          stock.liveLabels.forEach((label, idx) => {
            const labelDate = new Date(label);
            if (!isNaN(labelDate.getTime())) {
              labelDate.setHours(0, 0, 0, 0);
              if (labelDate.getTime() === compareDate.getTime()) {
                exactIndex = idx;
              }
            }
          });
          if (exactIndex !== -1) {
            return parseFloat(stock.liveCloses[exactIndex]) || fallbackPrice;
          }
        }

        // Fallback for mock walks and missing labels: map calendar offset days backwards from today
        const msDiff = today.getTime() - compareDate.getTime();
        const daysDiff = Math.max(0, Math.floor(msDiff / (24 * 60 * 60 * 1000)));

        // Adjust calendar days to trading days index: 5 trading days out of 7 calendar days
        const tradingDaysDiff = Math.floor(daysDiff * 5 / 7);
        const index = stock.liveCloses.length - 1 - tradingDaysDiff;

        if (index >= 0 && index < stock.liveCloses.length) {
          return parseFloat(stock.liveCloses[index]) || fallbackPrice;
        } else if (index < 0) {
          // If the date is older than our loaded history, return the oldest available historical price
          return parseFloat(stock.liveCloses[0]) || fallbackPrice;
        }
      }
      return fallbackPrice;
    }

    // For each date in the timeline, simulate holdings and calculate unrealized P&L
    timelineDates.forEach(D => {
      const holdingsOnDate = {};
      const lastPriceOnDate = {};

      txs.forEach(tx => {
        // Accumulate transactions that happened before or on this day
        if (tx.timestamp <= D.getTime() + 86399999) {
          const ticker = tx.ticker;
          const txPrice = parseFloat(tx.price) || 0;
          const txShares = parseInt(tx.shares) || 0;

          lastPriceOnDate[ticker] = txPrice;

          if (tx.type === 'BUY') {
            if (!holdingsOnDate[ticker]) {
              holdingsOnDate[ticker] = { shares: 0, avgCost: 0 };
            }
            const h = holdingsOnDate[ticker];
            const newTotalCost = (h.shares * h.avgCost) + (txShares * txPrice);
            h.shares += txShares;
            h.avgCost = h.shares > 0 ? (newTotalCost / h.shares) : 0;
          } else {
            // SELL
            if (holdingsOnDate[ticker]) {
              const h = holdingsOnDate[ticker];
              h.shares = Math.max(0, h.shares - txShares);
              if (h.shares === 0) {
                delete holdingsOnDate[ticker];
              }
            }
          }
        }
      });

      // Compute total unrealized profit on this simulation date
      let unrealizedPLOnDate = 0;
      Object.keys(holdingsOnDate).forEach(t => {
        const h = holdingsOnDate[t];
        if (h.shares > 0) {
          const price = getPriceOnDate(t, D, lastPriceOnDate[t] || h.avgCost || 0);
          unrealizedPLOnDate += h.shares * (price - h.avgCost);
        }
      });

      points.push({
        x: D,
        y: unrealizedPLOnDate
      });
    });

    // Safeguard: if there is only one simulation date (today), add a yesterday baseline to display a clean line
    if (points.length === 1) {
      const prevDate = new Date(points[0].x.getTime() - 24 * 60 * 60 * 1000);
      points.unshift({
        x: prevDate,
        y: 0
      });
    }

    // Sort data points chronologically to be absolutely certain they display left-to-right
    points.sort((a, b) => a.x.getTime() - b.x.getTime());

    // Labels represent clean short date formatting (e.g. "May 28")
    const labels = points.map(p => {
      return p.x.toLocaleDateString([], { month: 'short', day: 'numeric' });
    });
    const data = points.map(p => parseFloat(p.y.toFixed(2)) || 0);

    if (portfolioPerformanceChartInstance) {
      portfolioPerformanceChartInstance.destroy();
    }

    const ctx = canvas.getContext('2d');

    // Custom glowing line gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, 150);
    gradient.addColorStop(0, 'rgba(0, 240, 255, 0.2)');
    gradient.addColorStop(1, 'rgba(0, 240, 255, 0.0)');

    portfolioPerformanceChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Unrealized P&L',
          data: data,
          borderColor: '#00f0ff',
          borderWidth: 2,
          pointBackgroundColor: '#00f0ff',
          pointBorderColor: 'rgba(6, 9, 19, 0.8)',
          pointBorderWidth: 1.5,
          pointRadius: 0, // Invisible by default
          pointHoverRadius: 8, // Prominent hover dot
          pointHoverBackgroundColor: '#00f0ff',
          pointHoverBorderColor: '#fff', // White glow border on hover
          pointHoverBorderWidth: 2.5, // Thick hover border
          pointHitRadius: 10, // Easily trigger hover dot visibility
          fill: true,
          backgroundColor: gradient,
          tension: 0.2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: {
            right: 90
          }
        },
        interaction: {
          mode: 'index',
          intersect: false,
        },
        scales: {
          x: {
            display: true, // Show the date on the x-axis!
            grid: {
              display: false,
              drawBorder: false
            },
            ticks: {
              color: 'rgba(255, 255, 255, 0.4)',
              font: { family: 'Outfit', size: 9 },
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 5
            }
          },
          y: {
            position: 'right',
            beginAtZero: true,
            grid: {
              color: function (context) {
                if (context.tick && context.tick.value === 0) {
                  return 'rgba(0, 240, 255, 0.4)'; // Cyan zero baseline
                }
                return 'rgba(255, 255, 255, 0.05)';
              },
              borderDash: function (context) {
                if (context.tick && context.tick.value === 0) {
                  return [5, 5]; // Dashed zero line
                }
                return [];
              },
              drawBorder: false
            },
            ticks: {
              color: 'rgba(255, 255, 255, 0.5)',
              font: { family: 'Outfit', size: 10 },
              callback: function (value) {
                if (value >= 0) {
                  return '+$' + value.toLocaleString();
                } else {
                  return '-$' + Math.abs(value).toLocaleString();
                }
              }
            }
          }
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: 'rgba(13, 20, 38, 0.95)',
            titleColor: '#00f0ff',
            bodyColor: '#fff',
            borderColor: 'rgba(0, 240, 255, 0.2)',
            borderWidth: 1,
            titleFont: { family: 'Outfit', weight: '700', size: 11 },
            bodyFont: { family: 'Outfit', size: 11 },
            padding: 8,
            cornerRadius: 6,
            displayColors: false,
            callbacks: {
              title: function (context) {
                const idx = context[0].dataIndex;
                const d = points[idx].x;
                return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
              },
              label: function (context) {
                const val = context.parsed.y;
                if (val >= 0) {
                  return ` Unrealized P&L: +$${val.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                } else {
                  return ` Unrealized P&L: -$${Math.abs(val).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                }
              }
            }
          }
        }
      },
      plugins: [{
        id: 'zeroLinePlugin',
        afterDraw: (chart) => {
          const { ctx, scales: { y }, chartArea: { left, right, top, bottom } } = chart;
          if (!y) return;

          // 1. Draw Zero Baseline
          const zeroY = y.getPixelForValue(0);
          if (zeroY >= top && zeroY <= bottom) {
            ctx.save();
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(0, 240, 255, 0.3)'; // Cyan zero baseline
            ctx.lineWidth = 1.5;
            ctx.setLineDash([5, 5]);
            ctx.moveTo(left, zeroY);
            ctx.lineTo(right, zeroY);
            ctx.stroke();
            ctx.restore();
          }

          // 2. Draw Current P&L Level (Reference line and right-side Tag)
          const dataset = chart.data.datasets[0];
          if (dataset && dataset.data && dataset.data.length > 0) {
            const currentPL = dataset.data[dataset.data.length - 1];
            const currentPLY = y.getPixelForValue(currentPL);

            if (currentPLY >= top && currentPLY <= bottom) {
              ctx.save();

              // Draw reference dashed line
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
              ctx.lineWidth = 1;
              ctx.setLineDash([3, 3]);
              ctx.beginPath();
              ctx.moveTo(left, currentPLY);
              ctx.lineTo(right, currentPLY);
              ctx.stroke();

              // Draw tag box on the right Y-axis price scale
              const isGain = currentPL >= 0;
              ctx.fillStyle = isGain ? 'rgba(16, 185, 129, 0.9)' : 'rgba(244, 63, 94, 0.9)'; // Green or red background
              ctx.beginPath();
              ctx.roundRect(right + 5, currentPLY - 10, 80, 20, 4);
              ctx.fill();

              // Draw text inside tag
              ctx.fillStyle = '#ffffff';
              ctx.font = '700 9px var(--font-display)';
              const formattedPL = `${isGain ? '+' : '-'}$${Math.abs(currentPL).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
              ctx.fillText(`NOW: ${formattedPL}`, right + 10, currentPLY + 4);

              ctx.restore();
            }
          }
        }
      }]
    });
  } catch (error) {
    console.error("Error drawing unrealized performance chart:", error);
  }
}

// Delete transaction log entry and recalculate (reverts transaction)
function deleteTransactionEntry(index) {
  const tx = portfolioState.transactions[index];
  if (!tx) return;

  const confirmRevert = confirm(`Do you want to delete this transaction entry? This will revert its effect on your holdings.`);
  if (!confirmRevert) return;

  // Reconstruct holdings from remaining transactions list
  reconstructHoldingsFromTx(index);
}

function reconstructHoldingsFromTx(removeIndex) {
  portfolioState.transactions.splice(removeIndex, 1);
  rebuildPortfolioFromTransactions();
}

// Complete chronological reconstruction of holdings and realized P&L based on transactions
function rebuildPortfolioFromTransactions() {
  // Sort transactions chronologically
  portfolioState.transactions.sort((a, b) => a.timestamp - b.timestamp);

  const newHoldings = {};
  let newRealizedPL = 0;

  portfolioState.transactions.forEach(tx => {
    const ticker = tx.ticker;
    if (tx.type === 'BUY') {
      if (!newHoldings[ticker]) {
        newHoldings[ticker] = { shares: 0, avgCost: 0 };
      }
      const existing = newHoldings[ticker];
      const newTotalCost = (existing.shares * existing.avgCost) + (tx.shares * tx.price);
      existing.shares += tx.shares;
      existing.avgCost = existing.shares > 0 ? (newTotalCost / existing.shares) : 0;
    } else {
      // SELL
      if (newHoldings[ticker]) {
        const existing = newHoldings[ticker];
        // Calculate realized profit from this sale using the existing cost basis
        const txRealized = tx.shares * (tx.price - existing.avgCost);
        newRealizedPL += txRealized;

        existing.shares = Math.max(0, existing.shares - tx.shares);
        if (existing.shares === 0) {
          delete newHoldings[ticker];
        }
      }
    }
  });

  portfolioState.holdings = newHoldings;
  portfolioState.realizedPL = newRealizedPL;

  savePortfolioToStorage();
  updatePortfolioDashboard();
}

// Proactively load history (Twelve Data or generated mock walks) for all tickers in the transactions list
function loadPortfolioHistory() {
  const tickersInPortfolio = [...new Set(portfolioState.transactions.map(tx => tx.ticker))];

  tickersInPortfolio.forEach(ticker => {
    // If we already have the history loaded, skip!
    if (state.stocks[ticker] && state.stocks[ticker].liveCloses && state.stocks[ticker].liveCloses.length > 0) {
      return;
    }

    // Call async background fetcher
    fetchPortfolioStockHistory(ticker);
  });
}

async function fetchPortfolioStockHistory(ticker) {
  try {
    const response = await fetch(`/api/stock?ticker=${ticker}&timeframe=M`);
    if (!response.ok) throw new Error("Server error");
    const json = await response.json();
    if (json.status !== 'ok') throw new Error(json.message || "Twelve Data error");

    const values = json.values || [];
    if (values.length === 0) throw new Error("Empty values");

    const closes = [];
    const labels = [];

    values.forEach(v => {
      closes.push(parseFloat(v.close));
      const parts = v.datetime.split(' ');
      const dateObj = new Date(parts[0] + 'T00:00:00');
      labels.push(dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    });

    if (!state.stocks[ticker]) {
      state.stocks[ticker] = {};
    }
    state.stocks[ticker].ticker = ticker;
    state.stocks[ticker].price = parseFloat(values[values.length - 1].close);
    state.stocks[ticker].liveCloses = closes;
    state.stocks[ticker].liveLabels = labels;
    state.stocks[ticker].isLive = true;

    saveCachedStocks();

    // Trigger dashboard update once history is loaded
    updatePortfolioDashboard();
  } catch (err) {
    console.warn(`Background Twelve Data load failed for ${ticker}, using mock walk fallback:`, err);

    // Mock walk fallback
    if (!state.stocks[ticker]) {
      state.stocks[ticker] = {};
    }
    const basePrice = STOCKS_METADATA.find(s => s.ticker === ticker)?.price || 150.00;
    state.stocks[ticker].ticker = ticker;
    state.stocks[ticker].name = state.stocks[ticker].name || (ticker + ' Stock');
    state.stocks[ticker].price = basePrice;

    if (!state.stocks[ticker].history) {
      state.stocks[ticker].history = {
        D: generateWalk(basePrice, 24, 'up', 0.005),
        W: generateWalk(basePrice, 7, 'up', 0.012),
        M: generateWalk(basePrice, 30, 'up', 0.015),
        Y: generateWalk(basePrice, 52, 'up', 0.025)
      };
    }

    state.stocks[ticker].liveCloses = state.stocks[ticker].history['M'];
    state.stocks[ticker].liveLabels = getTimeframeLabels('M');
    state.stocks[ticker].isLive = true;

    saveCachedStocks();
    updatePortfolioDashboard();
  }
}

// Execute transaction
function executeTransaction(ticker, type, shares, price, dateStr = '') {
  shares = parseInt(shares);
  price = parseFloat(price);

  if (!ticker) {
    alert("Please select a stock asset first.");
    return false;
  }
  if (isNaN(shares) || shares <= 0) {
    alert("Please enter a valid quantity of shares.");
    return false;
  }
  if (isNaN(price) || price <= 0) {
    alert("Please enter a valid price per share.");
    return false;
  }

  // Pre-validate for sell sufficiency if we're selling
  if (type === 'SELL') {
    const holding = portfolioState.holdings[ticker];
    if (!holding || holding.shares < shares) {
      alert(`Insufficient shares. You are attempting to sell ${shares} shares of ${ticker}, but you only own ${holding ? holding.shares : 0} shares.`);
      return false;
    }
  }

  // Pre-validate transaction date (must not be in the future relative to today)
  if (dateStr) {
    const txDate = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (txDate > today) {
      alert(`Invalid Transaction Date: The selected date (${dateStr}) is in the future. Transactions cannot be recorded with a future date.`);
      return false;
    }
  }

  // Backdate support: if dateStr is provided, use T00:00:00 local-safe boundary, otherwise use Date.now()
  const timestamp = dateStr ? new Date(dateStr + 'T00:00:00').getTime() : Date.now();

  // Add Transaction entry
  portfolioState.transactions.push({
    timestamp: timestamp,
    ticker: ticker,
    type: type,
    shares: shares,
    price: price
  });

  // Re-build holdings & realized P&L chronologically
  rebuildPortfolioFromTransactions();

  // Proactively fetch background history if this is a newly traded stock in the portfolio
  loadPortfolioHistory();

  // Reset transaction form input values
  document.getElementById('txShares').value = 10;

  // Reset date picker to today
  const dateInput = document.getElementById('txDate');
  if (dateInput) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    dateInput.value = `${yyyy}-${mm}-${dd}`;
  }

  alert(`Successfully recorded transaction: ${type} ${shares} ${ticker} @ ${formatCurrency(price)}!`);
  return true;
}

// Portfolio Search and Autocomplete Widget
function setupPortfolioSearch() {
  const searchInput = document.getElementById('portfolioStockSearch');
  const dropdown = document.getElementById('portfolioSearchDropdown');
  const clearBtn = document.getElementById('clearPortfolioSearch');

  if (!searchInput || !dropdown) return;

  // Select Stock helper
  function selectStockForTransaction(ticker) {
    const stock = state.stocks[ticker] || STOCKS_METADATA.find(s => s.ticker === ticker);
    if (!stock) return;

    portfolioState.selectedTicker = ticker;
    searchInput.value = ticker;
    clearBtn.style.display = 'block';
    dropdown.style.display = 'none';

    // Set default price
    const currentPrice = stock.price || 150.00;
    document.getElementById('txPrice').value = currentPrice.toFixed(2);

    // Calculate total est
    const qty = parseInt(document.getElementById('txShares').value) || 10;
    document.getElementById('txTotalEst').innerText = formatCurrency(qty * currentPrice);

    // Show Stock Preview Info Card
    const preview = document.getElementById('portfolioStockPreview');
    const tickerEl = document.getElementById('previewTicker');
    const nameEl = document.getElementById('previewName');
    const priceEl = document.getElementById('previewPrice');
    const changeEl = document.getElementById('previewChange');

    tickerEl.innerText = stock.ticker;
    nameEl.innerText = stock.name || (stock.ticker + ' Stock');
    priceEl.innerText = formatCurrency(currentPrice);

    const changeVal = stock.change || 0;
    changeEl.innerText = `${changeVal >= 0 ? '+' : ''}${changeVal.toFixed(2)}%`;
    changeEl.className = changeVal >= 0 ? 'text-green' : 'text-red';

    preview.style.display = 'flex';
  }

  searchInput.addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase().trim();
    clearBtn.style.display = val.length > 0 ? 'block' : 'none';

    if (val.length === 0) {
      dropdown.style.display = 'none';
      return;
    }

    dropdown.innerHTML = '';

    // Filter STOCKS_METADATA & state.stocks
    const matches = Object.values(state.stocks).filter(stock =>
      stock.ticker.toLowerCase().includes(val) ||
      stock.name.toLowerCase().includes(val)
    );

    if (matches.length === 0) {
      // Add custom ticker option
      const div = document.createElement('div');
      div.className = 'portfolio-search-item';
      div.innerHTML = `
        <div>
          <span class="ticker"><i class="fa-solid fa-circle-plus"></i> ADD '${val.toUpperCase()}'</span>
          <span class="name">Add custom symbol</span>
        </div>
        <span class="price">Fetch Live</span>
      `;
      div.onclick = async () => {
        const ticker = val.toUpperCase();

        // Seed mock price just in case
        if (!state.stocks[ticker]) {
          state.stocks[ticker] = {
            ticker: ticker,
            name: ticker + ' Stock',
            price: 100.00,
            change: 0.0,
            trend: 'up'
          };
        }

        // Trigger asynchronous background fetch to get actual price
        await fetchStockPriceInBackground(ticker);
        selectStockForTransaction(ticker);
      };
      dropdown.appendChild(div);
    } else {
      matches.forEach(stock => {
        const div = document.createElement('div');
        div.className = 'portfolio-search-item';
        div.innerHTML = `
          <div>
            <span class="ticker">${stock.ticker}</span>
            <span class="name">${stock.name}</span>
          </div>
          <span class="price">${formatCurrency(stock.price)}</span>
        `;

        div.onclick = () => {
          selectStockForTransaction(stock.ticker);
        };
        dropdown.appendChild(div);
      });
    }
    dropdown.style.display = 'flex';
  });

  // Clear search action
  clearBtn.onclick = () => {
    searchInput.value = '';
    clearBtn.style.display = 'none';
    dropdown.style.display = 'none';
    document.getElementById('portfolioStockPreview').style.display = 'none';
    portfolioState.selectedTicker = null;
  };

  // Document click closes dropdown
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-box')) {
      dropdown.style.display = 'none';
    }
  });
}

// Setup View switching & Event Listeners
function setupPortfolioEventListeners() {
  // Navigation Tabs Toggling
  const navBtns = document.querySelectorAll('.nav-btn');
  const views = document.querySelectorAll('.workspace-view');

  navBtns.forEach(btn => {
    btn.onclick = (e) => {
      navBtns.forEach(b => b.classList.remove('active'));
      const targetBtn = e.currentTarget;
      targetBtn.classList.add('active');

      const targetView = targetBtn.getAttribute('data-view');
      views.forEach(v => {
        if (v.id === `view${targetView.charAt(0).toUpperCase() + targetView.slice(1)}`) {
          v.classList.add('active');
        } else {
          v.classList.remove('active');
        }
      });

      // Update data if switching to portfolio
      if (targetView === 'portfolio') {
        updatePortfolioDashboard();
      }
    };
  });

  // Transaction Form BUY / SELL Segmented buttons
  const txToggleBtns = document.querySelectorAll('.tx-toggle-btn');
  txToggleBtns.forEach(btn => {
    btn.onclick = (e) => {
      txToggleBtns.forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');

      const txType = e.currentTarget.getAttribute('data-tx');
      const submitBtn = document.getElementById('btnAddTransaction');

      if (txType === 'BUY') {
        submitBtn.style.background = 'linear-gradient(135deg, var(--cyan), var(--cyan-glow))';
        submitBtn.style.boxShadow = '0 4px 15px rgba(0, 240, 255, 0.2)';
        submitBtn.innerHTML = `<i class="fa-solid fa-circle-plus"></i> Record BUY Transaction`;
      } else {
        submitBtn.style.background = 'linear-gradient(135deg, var(--bearish), var(--bearish-glow))';
        submitBtn.style.boxShadow = '0 4px 15px var(--bearish-glow)';
        submitBtn.innerHTML = `<i class="fa-solid fa-circle-minus"></i> Record SELL Transaction`;
      }
    };
  });

  // Quantity & Price Input Change Listener for Estimated Cost Preview
  const txSharesInput = document.getElementById('txShares');
  const txPriceInput = document.getElementById('txPrice');

  if (txSharesInput && txPriceInput) {
    function recalculateEstimatedTxTotal() {
      const qty = parseInt(txSharesInput.value) || 0;
      const price = parseFloat(txPriceInput.value) || 0;
      document.getElementById('txTotalEst').innerText = formatCurrency(qty * price);
    }

    txSharesInput.addEventListener('input', recalculateEstimatedTxTotal);
    txPriceInput.addEventListener('input', recalculateEstimatedTxTotal);
  }

  // Record Transaction Action Trigger
  const recordTxBtn = document.getElementById('btnAddTransaction');
  if (recordTxBtn) {
    recordTxBtn.onclick = () => {
      const activeToggle = document.querySelector('.tx-toggle-btn.active');
      const type = activeToggle ? activeToggle.getAttribute('data-tx') : 'BUY';
      const ticker = portfolioState.selectedTicker;
      const shares = parseInt(txSharesInput.value);
      const price = parseFloat(txPriceInput.value);
      const dateInput = document.getElementById('txDate');
      const dateStr = dateInput ? dateInput.value : '';

      executeTransaction(ticker, type, shares, price, dateStr);
    };
  }

  // Reset Portfolio Button Action (resets active portfolio)
  const resetPortBtn = document.getElementById('btnResetPortfolio');
  if (resetPortBtn) {
    resetPortBtn.onclick = () => {
      const active = portfoliosList.find(p => p.id === activePortfolioId);
      const activeName = active ? active.name : "this portfolio";
      
      const confirmReset = confirm(`Are you absolutely sure you want to reset "${activeName}"?\nThis will liquidate all holdings and delete all transaction audit history for this portfolio.`);
      if (!confirmReset) return;

      portfolioState.holdings = {};
      portfolioState.transactions = [];
      portfolioState.selectedTicker = null;
      portfolioState.realizedPL = 0;

      // Reset search inputs
      const searchInput = document.getElementById('portfolioStockSearch');
      if (searchInput) searchInput.value = '';
      const preview = document.getElementById('portfolioStockPreview');
      if (preview) preview.style.display = 'none';

      savePortfolioToStorage();
      updatePortfolioDashboard();
      showNotification(`Portfolio "${activeName}" has been successfully reset!`, 'success');
    };
  }

  // Multi-Portfolio Selector change handler
  const portfolioSelector = document.getElementById('portfolioSelector');
  if (portfolioSelector) {
    portfolioSelector.onchange = (e) => {
      activePortfolioId = e.target.value;
      const active = portfoliosList.find(p => p.id === activePortfolioId);
      if (active) {
        portfolioState.holdings = active.holdings || {};
        portfolioState.transactions = active.transactions || [];
        portfolioState.realizedPL = active.realizedPL || 0;
        portfolioState.selectedTicker = null;
      }
      savePortfolioToStorage();
      
      // Load price histories for the newly active portfolio tickers
      loadPortfolioHistory();
      updatePortfolioDashboard();
      showNotification(`Switched to portfolio "${active ? active.name : ''}"`, 'success');
    };
  }

  // Create Portfolio Button Click Handler
  const btnCreatePortfolio = document.getElementById('btnCreatePortfolio');
  if (btnCreatePortfolio) {
    btnCreatePortfolio.onclick = () => {
      const name = prompt("Enter a unique name for the new portfolio:");
      if (name !== null) {
        createNewPortfolio(name);
      }
    };
  }

  // Delete Portfolio Button Click Handler
  const btnDeletePortfolio = document.getElementById('btnDeletePortfolio');
  if (btnDeletePortfolio) {
    btnDeletePortfolio.onclick = () => {
      deleteCurrentPortfolio();
    };
  }
}

// Initialize Portfolio Engine
function initPortfolio() {
  loadPortfolioFromStorage();
  updatePortfolioSelectorDropdown(); // Populate dropdown selector!
  setupPortfolioSearch();
  setupPortfolioEventListeners();

  // Default date input to local today's date YYYY-MM-DD
  const dateInput = document.getElementById('txDate');
  if (dateInput) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    dateInput.value = `${yyyy}-${mm}-${dd}`;
  }

  // Load price histories for all stocks present in the portfolio
  loadPortfolioHistory();

  updatePortfolioDashboard();
}
