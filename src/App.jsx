import React, { useState, useEffect } from 'react';
import Watchlist from './components/Watchlist';
import ChartContainer from './components/ChartContainer';
import AnalysisEngine from './components/AnalysisEngine';
import PortfolioManager from './components/PortfolioManager';
import PerformanceHoldings from './components/PerformanceHoldings';
import ToastContainer from './components/ToastContainer';

// Authoritative stock metadata list
export const STOCKS_METADATA = [
  { ticker: 'AAPL', name: 'Apple Inc.', price: 185.50, change: 1.45, trend: 'up' },
  { ticker: 'MSFT', name: 'Microsoft Corp.', price: 420.10, change: 0.85, trend: 'up' },
  { ticker: 'NVDA', name: 'NVIDIA Corp.', price: 925.00, change: 4.82, trend: 'up' },
  { ticker: 'TSLA', name: 'Tesla Inc.', price: 178.20, change: -2.31, trend: 'down' },
  { ticker: 'GOOG', name: 'Alphabet Inc.', price: 172.50, change: 1.12, trend: 'up' },
  { ticker: 'AMZN', name: 'Amazon.com Inc.', price: 180.80, change: -0.45, trend: 'down' }
];

// Helper to generate mock price walking history
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

// Generate labels matching timeframe intervals
function getTimeframeLabels(interval) {
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

// Fallback seed database constructor
function seedMockDatabase() {
  const seeded = {};
  STOCKS_METADATA.forEach(meta => {
    const history1m = generateWalk(meta.price, 390, meta.trend, 0.002);
    const history5m = generateWalk(meta.price, 390, meta.trend, 0.003);
    const history15m = generateWalk(meta.price, 546, meta.trend, 0.004);
    const history1h = generateWalk(meta.price, 150, meta.trend, 0.006);
    const history1d = generateWalk(meta.price, 260, meta.trend, 0.012);
    const history1w = generateWalk(meta.price, 52, meta.trend, 0.025);

    seeded[meta.ticker] = {
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
  });
  return seeded;
}

export default function App() {
  const [view, setView] = useState('terminal'); // 'terminal' | 'portfolio'
  
  // Toasts state
  const [toasts, setToasts] = useState([]);
  const addToast = (message, type = 'success') => {
    const id = Date.now() + Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
  };
  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // --------------------------------------------------------------------------
  // Global React State & LocalStorage Initializers
  // --------------------------------------------------------------------------

  // 1. Watchlist Tickers
  const [watchlist, setWatchlist] = useState(() => {
    try {
      const saved = localStorage.getItem('aethertrade_watchlist');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'GOOG', 'AMZN'];
  });

  // 2. Active Stock Ticker selection
  const [activeTicker, setActiveTicker] = useState(() => {
    return watchlist[0] || 'AAPL';
  });

  // 3. Current projecting capital
  const [currentCapital, setCurrentCapital] = useState(10000);

  // 4. Selections
  const [selectedRange, setSelectedRange] = useState('1M');
  const [selectedInterval, setSelectedInterval] = useState('1d');
  const [chartType, setChartType] = useState('line');
  const [showLevels, setShowLevels] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(100);

  // 5. Stocks cache (Pre-seed with fallback walking history initially)
  const [stocks, setStocks] = useState(() => {
    let base = seedMockDatabase();
    try {
      const saved = localStorage.getItem('aethertrade_cached_stocks');
      if (saved) {
        const parsed = JSON.parse(saved);
        Object.keys(parsed).forEach(ticker => {
          base[ticker] = {
            ...base[ticker],
            ...parsed[ticker],
            isLive: true
          };
        });
      }
    } catch (e) {
      console.error(e);
    }
    return base;
  });

  // 6. Drawn S&R Lines per ticker
  const [linesMap, setLinesMap] = useState(() => {
    try {
      const saved = localStorage.getItem('aethertrade_support_resistance');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return {};
  });

  // 7. Multi-Portfolio collections
  const [portfolios, setPortfolios] = useState(() => {
    try {
      const saved = localStorage.getItem('aethertrade_portfolios_list');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return [{
      id: 'default',
      name: 'Primary Portfolio',
      holdings: {},
      transactions: [],
      realizedPL: 0
    }];
  });

  // 8. Active portfolio ID reference
  const [activePortfolioId, setActivePortfolioId] = useState(() => {
    try {
      const saved = localStorage.getItem('aethertrade_active_portfolio_id');
      if (saved && saved !== 'undefined') return saved;
    } catch (e) {
      console.error(e);
    }
    return 'default';
  });

  // Loading spinner trigger state
  const [isLoading, setIsLoading] = useState(false);

  // --------------------------------------------------------------------------
  // Synchronized Persistence Effect Listeners
  // --------------------------------------------------------------------------
  useEffect(() => {
    localStorage.setItem('aethertrade_watchlist', JSON.stringify(watchlist));
  }, [watchlist]);

  useEffect(() => {
    localStorage.setItem('aethertrade_support_resistance', JSON.stringify(linesMap));
  }, [linesMap]);

  useEffect(() => {
    localStorage.setItem('aethertrade_portfolios_list', JSON.stringify(portfolios));
  }, [portfolios]);

  useEffect(() => {
    localStorage.setItem('aethertrade_active_portfolio_id', activePortfolioId);
  }, [activePortfolioId]);

  useEffect(() => {
    const toCache = {};
    Object.keys(stocks).forEach(ticker => {
      if (stocks[ticker] && stocks[ticker].isLive) {
        toCache[ticker] = stocks[ticker];
      }
    });
    localStorage.setItem('aethertrade_cached_stocks', JSON.stringify(toCache));
  }, [stocks]);

  // --------------------------------------------------------------------------
  // Twelve Data HTTP API Fetch Call and Fallback Wrapper
  // --------------------------------------------------------------------------
  const loadStockDataAndRender = async (ticker, rangeVal = selectedRange, intervalVal = selectedInterval) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/stock?ticker=${ticker}&range=${rangeVal}&interval=${intervalVal}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Proxy error: ${res.status}`);
      }
      const json = await res.json();
      if (json.status !== 'ok') {
        throw new Error(json.message || "Twelve Data error status");
      }

      const values = json.values || [];
      if (values.length === 0) {
        throw new Error("No values returned in series");
      }

      const fetchedPrice = parseFloat(values[values.length - 1].close);
      const prevPrice = values.length > 1 ? parseFloat(values[values.length - 2].close) : fetchedPrice;
      const dailyChange = prevPrice ? ((fetchedPrice - prevPrice) / prevPrice) * 100 : 0;
      
      const firstPrice = values[0] ? parseFloat(values[0].close) : fetchedPrice;
      const timeframeChange = firstPrice ? ((fetchedPrice - firstPrice) / firstPrice) * 100 : 0;

      const closes = [];
      const labels = [];
      const isIntraday = ['1m', '5m', '15m', '1h'].includes(intervalVal);

      values.forEach(item => {
        closes.push(parseFloat(parseFloat(item.close).toFixed(2)));
        const datetime = item.datetime;

        if (isIntraday) {
          const parts = datetime.split(' ');
          const timePart = parts[1] ? parts[1].substring(0, 5) : '';
          const datePart = parts[0];
          if (['1m', '5m', '15m'].includes(intervalVal)) {
            labels.push(timePart || datePart);
          } else {
            const dateObj = new Date(datePart + 'T' + (parts[1] || '00:00:00'));
            labels.push(dateObj.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }));
          }
        } else {
          const datePart = datetime.split(' ')[0];
          const dateObj = new Date(datePart + 'T00:00:00');
          labels.push(dateObj.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            ...(intervalVal !== '1d' && { year: '2-digit' })
          }));
        }
      });

      setStocks(prev => ({
        ...prev,
        [ticker]: {
          ...prev[ticker],
          ticker,
          name: prev[ticker]?.name || `${ticker} Stock`,
          price: fetchedPrice,
          change: dailyChange,
          timeframeChange: timeframeChange,
          liveCloses: closes,
          liveLabels: labels,
          liveRawValues: values,
          isLive: true
        }
      }));

      // Initialize drawn line array for symbol if empty
      if (!linesMap[ticker]) {
        setLinesMap(prev => ({ ...prev, [ticker]: [] }));
      }

    } catch (err) {
      console.warn(`Could not load Twelve Data for ${ticker}. Seeding fallback mock walk.`, err);

      const popular = STOCKS_METADATA.find(s => s.ticker === ticker);
      const isSymbolNotFound = err.message.toLowerCase().includes("not found") ||
                               err.message.toLowerCase().includes("not valid") ||
                               err.message.toLowerCase().includes("invalid symbol");

      if (isSymbolNotFound && !popular) {
        addToast(`Ticker "${ticker}" does not exist on Twelve Data!`, 'error');
        setWatchlist(prev => prev.filter(t => t !== ticker));
        if (activeTicker === ticker) {
          setActiveTicker(watchlist.length > 0 ? watchlist[0] : 'AAPL');
        }
        setIsLoading(false);
        return;
      }

      // Generate fallback mock walk price intervals
      const base = stocks[ticker] || seedMockDatabase()[ticker] || {
        ticker,
        name: `${ticker} Stock`,
        price: 150.00,
        change: 0.0,
        history: {}
      };

      const basePrice = base.price || 150.00;
      const mockHistory = base.history || {
        '1m': generateWalk(basePrice, 390, 'up', 0.002),
        '5m': generateWalk(basePrice, 390, 'up', 0.003),
        '15m': generateWalk(basePrice, 546, 'up', 0.004),
        '1h': generateWalk(basePrice, 150, 'up', 0.006),
        '1d': generateWalk(basePrice, 260, 'up', 0.012),
        '1w': generateWalk(basePrice, 52, 'up', 0.025)
      };

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
    } finally {
      setIsLoading(false);
    }
  };

  // Background fetch prices for other symbols in watchlist to keep sidebar updated
  const fetchStockPriceInBackground = async (ticker) => {
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
          change: change,
          isLive: true
        }
      }));
    } catch (e) {
      console.warn(`Background fetch failed for ${ticker}`, e);
    }
  };

  // Fetch long term history for portfolio transactions plotting
  const fetchPortfolioStockHistory = async (ticker) => {
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
        [ticker]: {
          ...prev[ticker],
          ticker,
          portfolioHistory: closes,
          portfolioLabels: labels,
          isLive: true
        }
      }));
    } catch (e) {
      // Mock historical wicks backup on failure
      const basePrice = stocks[ticker]?.price || 150.00;
      const mockHistory = stocks[ticker]?.history || {
        '1d': generateWalk(basePrice, 260, 'up', 0.012)
      };
      const mockCloses = mockHistory['1d'];
      const mockLabels = [];
      const today = new Date();
      for (let i = 0; i < 260; i++) {
        const d = new Date(today.getTime() - (260 - 1 - i) * 24 * 60 * 60 * 1000);
        mockLabels.push(d.toISOString().split('T')[0]);
      }

      setStocks(prev => ({
        ...prev,
        [ticker]: {
          ...prev[ticker],
          ticker,
          portfolioHistory: mockCloses,
          portfolioLabels: mockLabels,
          isLive: true
        }
      }));
    }
  };

  // Fetch histories for all tickers in active portfolio when portfolios list changes
  useEffect(() => {
    const active = portfolios.find(p => p.id === activePortfolioId);
    if (!active) return;

    const uniqueTickers = [...new Set(active.transactions.map(t => t.ticker))];
    uniqueTickers.forEach(ticker => {
      if (stocks[ticker] && stocks[ticker].portfolioHistory) return;
      fetchPortfolioStockHistory(ticker);
    });
  }, [activePortfolioId, portfolios]);

  // Bootstrapping queries and background fetches
  useEffect(() => {
    loadStockDataAndRender(activeTicker, selectedRange, selectedInterval);

    // Stagger loading sidebar assets
    const otherTickers = watchlist.filter(t => t !== activeTicker);
    otherTickers.forEach((ticker, index) => {
      setTimeout(() => {
        fetchStockPriceInBackground(ticker);
      }, (index + 1) * 2000);
    });
  }, [activeTicker, selectedRange, selectedInterval]);

  // --------------------------------------------------------------------------
  // Watchlist and state actions
  // --------------------------------------------------------------------------
  const handleRemoveTicker = (ticker) => {
    const nextWatchlist = watchlist.filter(t => t !== ticker);
    setWatchlist(nextWatchlist);

    if (activeTicker === ticker) {
      setActiveTicker(nextWatchlist.length > 0 ? nextWatchlist[0] : 'AAPL');
    }
    addToast(`Removed ${ticker} from watchlist.`, 'info');
  };

  const handleAddTicker = (ticker) => {
    if (!watchlist.includes(ticker)) {
      setWatchlist([...watchlist, ticker]);
    }
    setActiveTicker(ticker);
    addToast(`Added ${ticker} to watchlist!`, 'success');
  };

  // --------------------------------------------------------------------------
  // Chronological portfolio holdings math simulation helper
  // --------------------------------------------------------------------------
  const rebuildPortfolioHoldings = (txs) => {
    txs.sort((a, b) => a.timestamp - b.timestamp);
    const holdings = {};
    let realizedPL = 0;

    txs.forEach(tx => {
      const ticker = tx.ticker;
      const txFees = parseFloat(tx.fees) || 0;

      if (tx.type === 'BUY') {
        if (!holdings[ticker]) {
          holdings[ticker] = { shares: 0, avgCost: 0, totalFees: 0 };
        }
        const h = holdings[ticker];
        const newCost = (h.shares * h.avgCost) + (tx.shares * tx.price);
        h.shares += tx.shares;
        h.avgCost = h.shares > 0 ? (newCost / h.shares) : 0;
        h.totalFees += txFees;
      } else {
        if (holdings[ticker]) {
          const h = holdings[ticker];
          const realized = tx.shares * (tx.price - h.avgCost) - txFees;
          realizedPL += realized;

          const originalShares = h.shares;
          h.shares = Math.max(0, h.shares - tx.shares);

          if (originalShares > 0) {
            h.totalFees = h.shares * (h.totalFees / originalShares);
          } else {
            h.totalFees = 0;
          }

          if (h.shares < 1e-9) {
            delete holdings[ticker];
          }
        }
      }
    });

    return { holdings, realizedPL };
  };

  // Add transaction
  const handleAddTransaction = (portfolioId, newTx) => {
    const updated = portfolios.map(p => {
      if (p.id === portfolioId) {
        const transactions = [...p.transactions, newTx];
        const { holdings, realizedPL } = rebuildPortfolioHoldings(transactions);
        return { ...p, transactions, holdings, realizedPL };
      }
      return p;
    });
    setPortfolios(updated);
    addToast(`Recorded ${newTx.type} transaction for ${newTx.ticker}!`, 'success');
  };

  // Delete transaction log entry
  const handleDeleteTransaction = (portfolioId, index) => {
    const updated = portfolios.map(p => {
      if (p.id === portfolioId) {
        const transactions = [...p.transactions];
        transactions.splice(index, 1);
        const { holdings, realizedPL } = rebuildPortfolioHoldings(transactions);
        return { ...p, transactions, holdings, realizedPL };
      }
      return p;
    });
    setPortfolios(updated);
    addToast("Transaction entry deleted and reverted.", "warning");
  };

  // Reset portfolio
  const handleResetPortfolio = (portfolioId) => {
    const updated = portfolios.map(p => {
      if (p.id === portfolioId) {
        return { ...p, transactions: [], holdings: {}, realizedPL: 0 };
      }
      return p;
    });
    setPortfolios(updated);
    addToast("Portfolio liquidated and logs cleared.", "info");
  };

  // --------------------------------------------------------------------------
  // CSV Import Parsing and Export Operations
  // --------------------------------------------------------------------------
  const parseCSV = (text) => {
    const lines = [];
    let row = [""];
    let insideQuote = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (insideQuote && nextChar === '"') {
          row[row.length - 1] += '"';
          i++;
        } else {
          insideQuote = !insideQuote;
        }
      } else if (char === ',' && !insideQuote) {
        row.push("");
      } else if ((char === '\r' || char === '\n') && !insideQuote) {
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
        lines.push(row.map(cell => cell.trim()));
        row = [""];
      } else {
        row[row.length - 1] += char;
      }
    }
    if (row.length > 1 || row[0] !== "") {
      lines.push(row.map(cell => cell.trim()));
    }
    return lines;
  };

  const handleImportCSV = (csvText) => {
    try {
      const rows = parseCSV(csvText);
      if (rows.length < 2) {
        addToast("CSV file is empty or missing data rows.", "error");
        return;
      }

      const headers = rows[0].map(h => h.toLowerCase());
      const dateIdx = headers.findIndex(h => h.includes("date"));
      const typeIdx = headers.findIndex(h => h.includes("type"));
      const symbolIdx = headers.findIndex(h => h.includes("symbol") || h.includes("ticker") || h.includes("stock"));
      const qtyIdx = headers.findIndex(h => h.includes("qty") || h.includes("quantity") || h.includes("unit"));
      const priceIdx = headers.findIndex(h => h.includes("price") || h.includes("amount"));
      const feesIdx = headers.findIndex(h => h.includes("fee") || h.includes("commission"));
      const accountIdx = headers.findIndex(h => h.includes("account"));

      if (dateIdx === -1 || typeIdx === -1 || symbolIdx === -1 || qtyIdx === -1 || priceIdx === -1) {
        alert("CSV Import Failed: Missing required columns.\n\nRequired:\n- Date\n- Type (BUY/SELL)\n- Symbol\n- Quantity\n- Price");
        return;
      }

      const importedTxs = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length === 0 || (row.length === 1 && row[0] === "")) continue;

        const rowNum = i + 1;
        const dateVal = row[dateIdx];
        const typeVal = row[typeIdx];
        const symbolVal = row[symbolIdx];
        const qtyVal = row[qtyIdx];
        const priceVal = row[priceIdx];

        if (!dateVal || !typeVal || !symbolVal || !qtyVal || !priceVal) {
          throw new Error(`Row ${rowNum} contains empty cells.`);
        }

        const ticker = symbolVal.toUpperCase().trim();
        const type = typeVal.toUpperCase().trim();
        if (type !== 'BUY' && type !== 'SELL') {
          throw new Error(`Row ${rowNum}: Type must be BUY or SELL. Found: "${typeVal}"`);
        }

        const shares = parseFloat(String(qtyVal).replace(/,/g, '').trim());
        if (isNaN(shares) || shares <= 0) {
          throw new Error(`Row ${rowNum}: Quantity must be positive. Found: "${qtyVal}"`);
        }

        const price = parseFloat(String(priceVal).replace(/,/g, '').trim());
        if (isNaN(price) || price <= 0) {
          throw new Error(`Row ${rowNum}: Price must be positive. Found: "${priceVal}"`);
        }

        const dateParts = dateVal.split(/[-/]/);
        if (dateParts.length !== 3) {
          throw new Error(`Row ${rowNum}: Date format must be DD-MM-YYYY. Found: "${dateVal}"`);
        }
        const txDate = new Date(`${dateParts[2]}-${dateParts[1].padStart(2, '0')}-${dateParts[0].padStart(2, '0')}T00:00:00`);
        if (isNaN(txDate.getTime())) {
          throw new Error(`Row ${rowNum}: Date "${dateVal}" is invalid.`);
        }
        if (txDate > today) {
          throw new Error(`Row ${rowNum}: Date is in the future.`);
        }

        const feesVal = feesIdx !== -1 ? row[feesIdx] : "0";
        const fees = parseFloat(String(feesVal).replace(/,/g, '').trim()) || 0;
        if (isNaN(fees) || fees < 0) {
          throw new Error(`Row ${rowNum}: Fees must be non-negative.`);
        }

        const account = accountIdx !== -1 ? row[accountIdx].trim() : "Default";

        importedTxs.push({
          timestamp: txDate.getTime(),
          ticker,
          type,
          shares,
          price,
          fees,
          account
        });
      }

      const active = portfolios.find(p => p.id === activePortfolioId) || portfolios[0];
      const choice = confirm(
        `Found ${importedTxs.length} valid transactions.\n\n` +
        `Click OK to APPEND to matched portfolios.\n` +
        `Click CANCEL to REPLACE matching portfolios.`
      );

      // Group by portfolio account match
      const txsByPortfolio = {};
      importedTxs.forEach(tx => {
        const account = tx.account || '';
        const match = portfolios.find(p => p.name.toLowerCase() === account.toLowerCase()) || active;
        const id = match.id;
        if (!txsByPortfolio[id]) {
          txsByPortfolio[id] = [];
        }
        txsByPortfolio[id].push(tx);
      });

      // Simulation checks to prevent sales below owned balance
      const affectedPortIds = Object.keys(txsByPortfolio);
      for (let pIdx = 0; pIdx < affectedPortIds.length; pIdx++) {
        const id = affectedPortIds[pIdx];
        const port = portfolios.find(p => p.id === id);
        if (!port) continue;

        const imported = txsByPortfolio[id];
        const existing = choice ? port.transactions : [];
        const combined = [...existing, ...imported].sort((a, b) => a.timestamp - b.timestamp);

        const simHoldings = {};
        for (let i = 0; i < combined.length; i++) {
          const tx = combined[i];
          const t = tx.ticker;
          if (tx.type === 'BUY') {
            simHoldings[t] = (simHoldings[t] || 0) + tx.shares;
          } else {
            const owned = simHoldings[t] || 0;
            if (owned + 1e-9 < tx.shares) {
              const dateStr = new Date(tx.timestamp).toLocaleDateString();
              alert(`Import Aborted (Insufficiency in "${port.name}"): On ${dateStr}, you sold ${tx.shares} ${tx.ticker} but only owned ${owned} shares.`);
              return;
            }
            simHoldings[t] = owned - tx.shares;
            if (simHoldings[t] < 1e-9) delete simHoldings[t];
          }
        }
      }

      // Commit changes
      const updated = portfolios.map(port => {
        const imported = txsByPortfolio[port.id];
        if (!imported) return port;

        const existing = choice ? port.transactions : [];
        const combined = [...existing, ...imported].sort((a, b) => a.timestamp - b.timestamp);
        const { holdings, realizedPL } = rebuildPortfolioHoldings(combined);

        return {
          ...port,
          transactions: combined,
          holdings,
          realizedPL
        };
      });

      setPortfolios(updated);
      addToast(`Successfully imported ${importedTxs.length} transactions!`, 'success');
    } catch (err) {
      alert(`CSV Import Failed:\n\n${err.message}`);
    }
  };

  const handleExportCSV = (portfolioId) => {
    const port = portfolios.find(p => p.id === portfolioId);
    if (!port || port.transactions.length === 0) {
      addToast("No transactions recorded to export.", "warning");
      return;
    }

    let csvContent = "Date,Type,Symbol,Quantity,Price,Fee,Account\r\n";
    port.transactions.forEach(tx => {
      const d = new Date(tx.timestamp);
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dateStr = `${dd}-${mm}-${d.getFullYear()}`;
      csvContent += `${dateStr},${tx.type},${tx.ticker},${tx.shares},${tx.price},${tx.fees || 0},"${tx.account || 'Default'}"\r\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${port.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_transactions_export.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    addToast("Transactions exported successfully!", "success");
  };

  return (
    <>
      <div className="glow-sphere glow-sphere-1"></div>
      <div className="glow-sphere glow-sphere-2"></div>

      <header className="app-header">
        <div className="header-logo">
          <div className="logo-icon">
            <i className="fa-solid fa-chart-line"></i>
          </div>
          <div className="logo-text">
            <span className="logo-brand">AETHER</span>
            <span className="logo-sub">TRADE</span>
          </div>
        </div>

        <nav className="app-nav">
          <button
            onClick={() => setView('terminal')}
            className={`nav-btn ${view === 'terminal' ? 'active' : ''}`}
            id="navBtnTerminal"
          >
            <i className="fa-solid fa-chart-line"></i> Terminal
          </button>
          <button
            onClick={() => setView('portfolio')}
            className={`nav-btn ${view === 'portfolio' ? 'active' : ''}`}
            id="navBtnPortfolio"
          >
            <i className="fa-solid fa-briefcase"></i> Portfolio
          </button>
        </nav>
      </header>

      <main className="app-workspace">
        {view === 'terminal' ? (
          <div id="viewTerminal" className="workspace-view active">
            <Watchlist
              watchlist={watchlist}
              activeTicker={activeTicker}
              setActiveTicker={setActiveTicker}
              stocks={stocks}
              onRemoveTicker={handleRemoveTicker}
              onAddTicker={handleAddTicker}
            />

            <ChartContainer
              activeTicker={activeTicker}
              stocks={stocks}
              range={selectedRange}
              setRange={setSelectedRange}
              interval={selectedInterval}
              setInterval={setSelectedInterval}
              chartType={chartType}
              setChartType={setChartType}
              showLevels={showLevels}
              setShowLevels={setShowLevels}
              zoomLevel={zoomLevel}
              setZoomLevel={setZoomLevel}
              linesMap={linesMap}
              setLinesMap={setLinesMap}
              onRefresh={() => loadStockDataAndRender(activeTicker)}
              isLoading={isLoading}
            />

            <AnalysisEngine
              activeTicker={activeTicker}
              currentPrice={stocks[activeTicker]?.price || 150.00}
              lines={linesMap[activeTicker] || []}
              setLinesMap={setLinesMap}
              linesMap={linesMap}
              currentCapital={currentCapital}
              setCurrentCapital={setCurrentCapital}
            />
          </div>
        ) : (
          <div id="viewPortfolio" className="workspace-view active">
            <PortfolioManager
              portfolios={portfolios}
              setPortfolios={setPortfolios}
              activePortfolioId={activePortfolioId}
              setActivePortfolioId={setActivePortfolioId}
              stocks={stocks}
              onAddTransaction={handleAddTransaction}
              showNotification={addToast}
            />

            <PerformanceHoldings
              portfolios={portfolios}
              activePortfolioId={activePortfolioId}
              stocks={stocks}
              onAddTransaction={handleAddTransaction}
              onDeleteTransaction={handleDeleteTransaction}
              onResetPortfolio={handleResetPortfolio}
              onImportCSV={handleImportCSV}
              onExportCSV={handleExportCSV}
              showNotification={addToast}
            />
          </div>
        )}
      </main>

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </>
  );
}
