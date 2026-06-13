// ==========================================================================
// STATE MODULE (state.js)
// Manages global caching, active states, mock walks, and localStorage syncs
// ==========================================================================

export const STOCKS_METADATA = [
  { ticker: 'AAPL', name: 'Apple Inc.', price: 185.50, change: 1.45, trend: 'up' },
  { ticker: 'MSFT', name: 'Microsoft Corp.', price: 420.10, change: 0.85, trend: 'up' },
  { ticker: 'NVDA', name: 'NVIDIA Corp.', price: 925.00, change: 4.82, trend: 'up' },
  { ticker: 'TSLA', name: 'Tesla Inc.', price: 178.20, change: -2.31, trend: 'down' },
  { ticker: 'GOOG', name: 'Alphabet Inc.', price: 172.50, change: 1.12, trend: 'up' },
  { ticker: 'AMZN', name: 'Amazon.com Inc.', price: 180.80, change: -0.45, trend: 'down' }
];

export const state = {
  activeTicker: 'AAPL',
  currentCapital: 10000,
  selectedRange: '1M',
  selectedInterval: '1d',
  chartType: 'line', // 'line' or 'candle'
  showLevels: true,
  zoomLevel: 100,
  stocks: {},
  linesMap: {},
  hoverPrice: null,
  watchlist: [],
  chartStartIndex: undefined,
  chartEndIndex: undefined
};

export let portfoliosList = [];
export let activePortfolioId = 'default';

export const portfolioState = {
  holdings: {},
  transactions: [],
  selectedTicker: null,
  realizedPL: 0
};

// Set active portfolio ID directly
export function setActivePortfolioId(id) {
  activePortfolioId = id;
}

// Set portfolios list directly (for replacement/loads)
export function setPortfoliosList(list) {
  portfoliosList = list;
}

// Sync single portfolioState into portfoliosList
export function syncActivePortfolioState() {
  const active = portfoliosList.find(p => p.id === activePortfolioId);
  if (active) {
    active.holdings = portfolioState.holdings;
    active.transactions = portfolioState.transactions;
    active.realizedPL = portfolioState.realizedPL;
  }
}

// Watchlist local storage syncing
export function loadWatchlist() {
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

export function saveWatchlist() {
  try {
    localStorage.setItem('aethertrade_watchlist', JSON.stringify(state.watchlist));
  } catch (e) {
    console.error('Failed to save watchlist to localStorage', e);
  }
}

// Cached stocks local storage syncing
export function saveCachedStocks() {
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

export function loadCachedStocks() {
  try {
    const saved = localStorage.getItem('aethertrade_cached_stocks');
    if (saved) {
      const parsed = JSON.parse(saved);
      Object.keys(parsed).forEach(ticker => {
        state.stocks[ticker] = parsed[ticker];
        state.stocks[ticker].isLive = true;
      });
      return true;
    }
  } catch (e) {
    console.error('Failed to load cached stocks from localStorage', e);
  }
  return false;
}

// Support & Resistance lines local storage syncing
export function saveSupportResistanceLines() {
  try {
    localStorage.setItem('aethertrade_support_resistance', JSON.stringify(state.linesMap));
  } catch (e) {
    console.error('Failed to save support/resistance lines to localStorage', e);
  }
}

export function loadSupportResistanceLines() {
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

// Seeding Fallback Mock Database
export function seedMockDatabase() {
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

    const history1m = generateWalk(meta.price, 390, meta.trend, 0.002);
    const history5m = generateWalk(meta.price, 390, meta.trend, 0.003);
    const history15m = generateWalk(meta.price, 546, meta.trend, 0.004);
    const history1h = generateWalk(meta.price, 150, meta.trend, 0.006);
    const history1d = generateWalk(meta.price, 260, meta.trend, 0.012);
    const history1w = generateWalk(meta.price, 52, meta.trend, 0.025);

    state.stocks[ticker] = {
      ...meta,
      isLive: false,
      history: {
        '1m': history1m,
        '5m': history5m,
        '15m': history15m,
        '1h': history1h,
        '1d': history1d,
        '1w': history1w
      },
      liveCloses: [...history1d].slice(-30),
      liveLabels: getTimeframeLabels('1d').slice(-30),
      liveRawValues: []
    };
    if (!state.linesMap[ticker]) {
      state.linesMap[ticker] = [];
    }
  });
}

export function generateWalk(currentPrice, points, overallTrend, volatility) {
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

export function getTimeframeLabels(interval) {
  switch (interval) {
    case '1m':
      return Array.from({ length: 390 }, (_, i) => {
        const time = new Date(Date.now() - (390 - 1 - i) * 60 * 1000);
        return time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      });
    case '5m':
      return Array.from({ length: 390 }, (_, i) => {
        const time = new Date(Date.now() - (390 - 1 - i) * 5 * 60 * 1000);
        return time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      });
    case '15m':
      return Array.from({ length: 546 }, (_, i) => {
        const time = new Date(Date.now() - (546 - 1 - i) * 15 * 60 * 1000);
        return time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      });
    case '1h':
      return Array.from({ length: 150 }, (_, i) => {
        const time = new Date(Date.now() - (150 - 1 - i) * 60 * 60 * 1000);
        return time.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      });
    case '1d':
      return Array.from({ length: 260 }, (_, i) => {
        const dateObj = new Date(Date.now() - (260 - 1 - i) * 24 * 60 * 60 * 1000);
        return dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      });
    case '1w':
      return Array.from({ length: 52 }, (_, i) => {
        const dateObj = new Date(Date.now() - (52 - 1 - i) * 7 * 24 * 60 * 60 * 1000);
        return dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
      });
    default:
      return [];
  }
}

// Premium glassmorphic toast notification system
export function showNotification(message, type = 'success') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.style.cssText = `
      position: fixed;
      top: 24px;
      right: 24px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      z-index: 9999;
      pointer-events: none;
      max-width: 380px;
      width: calc(100% - 48px);
    `;
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `glass-toast ${type}`;
  
  let iconClass = 'fa-circle-check';
  if (type === 'error') iconClass = 'fa-circle-exclamation';
  if (type === 'warning') iconClass = 'fa-triangle-exclamation';
  if (type === 'info') iconClass = 'fa-circle-info';

  toast.style.cssText = `
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 18px;
    background: rgba(10, 15, 30, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-radius: var(--radius-md);
    color: #fff;
    font-family: var(--font-body);
    font-weight: 500;
    font-size: 13px;
    transform: translateX(120%);
    opacity: 0;
    transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    pointer-events: auto;
  `;

  toast.innerHTML = `
    <i class="fa-solid ${iconClass}" style="font-size: 16px; color: ${
      type === 'success' ? 'var(--bullish)' :
      type === 'error' ? 'var(--bearish)' :
      type === 'warning' ? '#f59e0b' : 'var(--cyan)'
    };"></i>
    <span style="flex: 1; line-height: 1.4;">${message}</span>
    <button class="toast-close-btn" style="background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 4px; font-size: 14px; transition: color var(--transition-fast); margin-left: 6px;"><i class="fa-solid fa-xmark"></i></button>
  `;

  // Dynamic Theme Highlight Borders
  if (type === 'success') toast.style.borderLeft = '3px solid var(--bullish)';
  if (type === 'error') toast.style.borderLeft = '3px solid var(--bearish)';
  if (type === 'warning') toast.style.borderLeft = '3px solid #f59e0b';
  if (type === 'info') toast.style.borderLeft = '3px solid var(--cyan)';

  container.appendChild(toast);

  toast.querySelector('.toast-close-btn').onclick = () => {
    toast.style.transform = 'translateX(120%)';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 400);
  };

  // Animate in
  setTimeout(() => {
    toast.style.transform = 'translateX(0)';
    toast.style.opacity = '1';
  }, 50);

  // Auto remove after 4 seconds
  setTimeout(() => {
    if (toast.parentNode) {
      toast.style.transform = 'translateX(120%)';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 400);
    }
  }, 4000);
}

// Load Multi-Portfolio lists from localStorage
export function loadPortfolioFromStorage() {
  const storedList = localStorage.getItem('aethertrade_portfolios_list');
  const storedActiveId = localStorage.getItem('aethertrade_active_portfolio_id');
  const storedOldSingle = localStorage.getItem('aethertrade_portfolio');

  try {
    if (storedList) {
      setPortfoliosList(JSON.parse(storedList));
    } else {
      let oldHoldings = {};
      let oldTransactions = [];
      let oldRealizedPL = 0;

      if (storedOldSingle) {
        const oldData = JSON.parse(storedOldSingle);
        oldHoldings = oldData.holdings || {};
        oldTransactions = oldData.transactions || [];
        oldRealizedPL = oldData.realizedPL || 0;
      }

      setPortfoliosList([{
        id: 'default',
        name: 'Primary Portfolio',
        holdings: oldHoldings,
        transactions: oldTransactions,
        realizedPL: oldRealizedPL
      }]);
      
      localStorage.setItem('aethertrade_portfolios_list', JSON.stringify(portfoliosList));
    }

    setActivePortfolioId(storedActiveId || 'default');
    
    let active = portfoliosList.find(p => p.id === activePortfolioId);
    if (!active) {
      active = portfoliosList[0] || { id: 'default', name: 'Primary Portfolio', holdings: {}, transactions: [], realizedPL: 0 };
      setActivePortfolioId(active.id);
    }

    portfolioState.holdings = active.holdings || {};
    portfolioState.transactions = active.transactions || [];
    portfolioState.realizedPL = active.realizedPL || 0;
    portfolioState.selectedTicker = null;

  } catch (e) {
    console.error("Failed to load portfolios from storage", e);
    setPortfoliosList([{ id: 'default', name: 'Primary Portfolio', holdings: {}, transactions: [], realizedPL: 0 }]);
    setActivePortfolioId('default');
    portfolioState.holdings = {};
    portfolioState.transactions = [];
    portfolioState.realizedPL = 0;
  }
}

// Save active state into portfoliosList and write to LocalStorage
export function savePortfolioToStorage() {
  syncActivePortfolioState();
  localStorage.setItem('aethertrade_portfolios_list', JSON.stringify(portfoliosList));
  localStorage.setItem('aethertrade_active_portfolio_id', activePortfolioId);
}
