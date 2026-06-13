// ==========================================================================
// API SERVICE MODULE (api.js)
// Handles Twelve Data HTTP proxy fetches and background stock loaders
// ==========================================================================

import {
  state,
  STOCKS_METADATA,
  saveCachedStocks,
  saveWatchlist,
  getTimeframeLabels,
  generateWalk,
  showNotification,
  portfoliosList,
  activePortfolioId
} from './state.js';

import {
  mainChart,
  setMainChart,
  renderStockChartDirect
} from './charts.js';

import {
  updateDashboard,
  renderStockList
} from '../app.js';

import {
  updatePortfolioDashboard,
  rebuildSpecificPortfolio
} from './portfolio.js';

// Live Twelve Data API Fetcher with dynamic key rotation and fallback handlers
export async function loadStockDataAndRender(ticker) {
  const chartContainer = document.querySelector('.chart-container');
  if (chartContainer) chartContainer.classList.add('loading');

  const refreshIcon = document.querySelector('#btnRefreshStock i');
  if (refreshIcon) refreshIcon.classList.add('fa-spin');

  // Reset chart index bounds and zoom level on active stock or timeframe/interval change
  state.chartStartIndex = undefined;
  state.chartEndIndex = undefined;
  state.zoomLevel = 100;
  
  const zoomSlider = document.getElementById('zoomSlider');
  const zoomLabel = document.getElementById('zoomLabel');
  if (zoomSlider) zoomSlider.value = 100;
  if (zoomLabel) zoomLabel.innerText = '100%';

  // Immediately destroy old chart and render clear canvas with glowing loading text in the center
  if (mainChart) {
    mainChart.destroy();
    setMainChart(null);
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
    const response = await fetch(`/api/stock?ticker=${ticker}&range=${state.selectedRange}&interval=${state.selectedInterval}`);
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

    // Only update the authoritative real-time price from the interval 1d (daily series)
    if (state.selectedInterval === '1d' || !state.stocks[ticker].price) {
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
    if (state.selectedInterval === '1d') {
      dailyPrevPrice = values.length > 1 ? parseFloat(values[values.length - 2].close) : currentPrice;
      state.stocks[ticker].prevClose = dailyPrevPrice;
    } else if (state.stocks[ticker].prevClose !== undefined && state.stocks[ticker].prevClose !== null) {
      dailyPrevPrice = state.stocks[ticker].prevClose;
    } else {
      dailyPrevPrice = values.length > 1 ? parseFloat(values[values.length - 2].close) : currentPrice;
      fetchStockPriceInBackground(ticker);
    }
    const dailyChange = dailyPrevPrice ? ((currentPrice - dailyPrevPrice) / dailyPrevPrice) * 100 : 0;

    // Timeframe-specific change for chart header
    const prevPrice = values[0] ? parseFloat(values[0].close) : currentPrice;
    const timeframeChange = prevPrice ? ((currentPrice - prevPrice) / prevPrice) * 100 : 0;

    const closes = [];
    const labels = [];
    const isIntraday = ['1m', '5m', '15m', '1h'].includes(state.selectedInterval);

    values.forEach(item => {
      closes.push(parseFloat(parseFloat(item.close).toFixed(2)));

      const datetime = item.datetime;
      if (isIntraday) {
        const parts = datetime.split(' ');
        const timePart = parts[1] ? parts[1].substring(0, 5) : '';
        const datePart = parts[0];

        if (['1m', '5m', '15m'].includes(state.selectedInterval)) {
          labels.push(timePart || datePart);
        } else {
          const dateObj = new Date(datePart + 'T' + (parts[1] || '00:00:00'));
          labels.push(dateObj.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }));
        }
      } else {
        const datePart = datetime.split(' ')[0];
        const dateObj = new Date(datePart + 'T00:00:00');
        if (state.selectedInterval === '1d') {
          labels.push(dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        } else {
          labels.push(dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }));
        }
      }
    });

    if (!state.stocks[ticker]) {
      state.stocks[ticker] = {};
    }
    state.stocks[ticker].ticker = ticker;
    state.stocks[ticker].name = state.stocks[ticker].name || (ticker + ' Stock');
    state.stocks[ticker].price = currentPrice;
    state.stocks[ticker].change = dailyChange;
    state.stocks[ticker].timeframeChange = timeframeChange;
    state.stocks[ticker].liveCloses = closes;
    state.stocks[ticker].liveLabels = labels;
    state.stocks[ticker].liveRawValues = values;
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

      state.watchlist = state.watchlist.filter(t => t !== ticker);
      saveWatchlist();
      delete state.stocks[ticker];

      if (state.activeTicker === ticker) {
        state.activeTicker = state.watchlist.length > 0 ? state.watchlist[0] : 'AAPL';
      }

      showNotification(`Ticker "${ticker}" does not exist on Twelve Data!`, 'error');
      await loadStockDataAndRender(state.activeTicker);
      renderStockList('');
      return;
    }

    console.warn(`Could not load Twelve Data for ${ticker}. Loading generated fallback mock data.`, err);

    if (!state.stocks[ticker]) {
      state.stocks[ticker] = {};
    }

    if (!state.stocks[ticker].history) {
      const basePrice = STOCKS_METADATA.find(s => s.ticker === ticker)?.price || 150.00;
      state.stocks[ticker].ticker = ticker;
      state.stocks[ticker].name = state.stocks[ticker].name || (ticker + ' Stock');
      state.stocks[ticker].price = basePrice;
      state.stocks[ticker].history = {
        '1m': generateWalk(basePrice, 200, 'up', 0.002),
        '5m': generateWalk(basePrice, 200, 'up', 0.003),
        '15m': generateWalk(basePrice, 200, 'up', 0.004),
        '1h': generateWalk(basePrice, 200, 'up', 0.006),
        D: generateWalk(basePrice, 100, 'up', 0.005),
        W: generateWalk(basePrice, 150, 'up', 0.012),
        M: generateWalk(basePrice, 200, 'up', 0.015),
        Y: generateWalk(basePrice, 150, 'up', 0.025)
      };
    }

    state.stocks[ticker].liveCloses = state.stocks[ticker].history[state.selectedInterval];
    state.stocks[ticker].liveLabels = getTimeframeLabels(state.selectedInterval);

    const closes = state.stocks[ticker].liveCloses || [];
    if (closes.length > 0 && state.stocks[ticker].price !== undefined) {
      closes[closes.length - 1] = state.stocks[ticker].price;
    }

    const baseWalkPrice = closes[0] || state.stocks[ticker].price || 150.00;
    const currentWalkPrice = state.stocks[ticker].price || (closes.length > 0 ? closes[closes.length - 1] : baseWalkPrice);

    const mCloses = state.stocks[ticker].history ? state.stocks[ticker].history['1d'] : [];
    const yesterdayClose = mCloses && mCloses.length > 1 ? mCloses[mCloses.length - 2] : baseWalkPrice;
    const dailyChange = yesterdayClose ? ((currentWalkPrice - yesterdayClose) / yesterdayClose) * 100 : 0.35;
    const timeframeChange = baseWalkPrice ? ((currentWalkPrice - baseWalkPrice) / baseWalkPrice) * 100 : 0;

    state.stocks[ticker].change = dailyChange;
    state.stocks[ticker].timeframeChange = timeframeChange;
    state.stocks[ticker].liveRawValues = null;
    state.stocks[ticker].isLive = true;
    saveCachedStocks();
  } finally {
    const refreshIcon = document.querySelector('#btnRefreshStock i');
    if (refreshIcon) refreshIcon.classList.remove('fa-spin');
    if (chartContainer) chartContainer.classList.remove('loading');
    renderStockChartDirect();
    updateDashboard();
  }
}

// Background fetch helper to keep popular stock list prices up to date
export async function fetchStockPriceInBackground(ticker) {
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

    const searchInput = document.getElementById('stockSearch');
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    renderStockList(query);
    updatePortfolioDashboard();
  } catch (err) {
    console.warn(`Background fetch failed for ${ticker}:`, err);
  }
}

// Proactively load history for all tickers in the transactions list
export function loadPortfolioHistory() {
  const tickersInPortfolio = [...new Set(state.stocks && portfoliosList ? portfoliosList.reduce((acc, p) => acc.concat((p.transactions || []).map(tx => tx.ticker)), []) : [])];

  tickersInPortfolio.forEach(ticker => {
    if (state.stocks[ticker] && state.stocks[ticker].portfolioHistory && state.stocks[ticker].portfolioHistory.length > 0) {
      return;
    }
    fetchPortfolioStockHistory(ticker);
  });
}

export async function fetchPortfolioStockHistory(ticker) {
  try {
    const response = await fetch(`/api/stock?ticker=${ticker}&timeframe=Y`);
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
      labels.push(parts[0]); // Raw "YYYY-MM-DD"
    });

    if (!state.stocks[ticker]) {
      state.stocks[ticker] = {};
    }
    state.stocks[ticker].ticker = ticker;
    if (!state.stocks[ticker].price) {
      state.stocks[ticker].price = parseFloat(values[values.length - 1].close);
    }
    state.stocks[ticker].portfolioHistory = closes;
    state.stocks[ticker].portfolioLabels = labels;
    state.stocks[ticker].isLive = true;

    saveCachedStocks();
    updatePortfolioDashboard();
  } catch (err) {
    console.warn(`Background Twelve Data load failed for ${ticker}, using mock walk fallback:`, err);

    if (!state.stocks[ticker]) {
      state.stocks[ticker] = {};
    }
    const basePrice = STOCKS_METADATA.find(s => s.ticker === ticker)?.price || 150.00;
    state.stocks[ticker].ticker = ticker;
    state.stocks[ticker].name = state.stocks[ticker].name || (ticker + ' Stock');
    if (!state.stocks[ticker].price) {
      state.stocks[ticker].price = basePrice;
    }

    if (!state.stocks[ticker].history) {
      state.stocks[ticker].history = {
        D: generateWalk(basePrice, 24, 'up', 0.005),
        W: generateWalk(basePrice, 7, 'up', 0.012),
        M: generateWalk(basePrice, 30, 'up', 0.015),
        Y: generateWalk(basePrice, 52, 'up', 0.025)
      };
    }

    const mockCloses = state.stocks[ticker].history['Y'];
    const mockLabels = [];
    const today = new Date();
    for (let i = 0; i < 52; i++) {
      const d = new Date(today.getTime() - (52 - 1 - i) * 7 * 24 * 60 * 60 * 1000);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      mockLabels.push(`${yyyy}-${mm}-${dd}`);
    }

    state.stocks[ticker].portfolioHistory = mockCloses;
    state.stocks[ticker].portfolioLabels = mockLabels;
    state.stocks[ticker].isLive = true;

    saveCachedStocks();
    updatePortfolioDashboard();
  }
}
