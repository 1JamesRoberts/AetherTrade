import { useState, useEffect, useCallback, useRef } from 'react';
import Watchlist from './components/Watchlist';
import ChartContainer from './components/ChartContainer';
import AnalysisEngine from './components/AnalysisEngine';
import PortfolioManager from './components/PortfolioManager';
import PerformanceHoldings from './components/PerformanceHoldings';
import ToastContainer from './components/ToastContainer';
import { useStockData } from './hooks/useStockData';
import { useWatchlist } from './hooks/useWatchlist';
import { usePortfolio, rebuildPortfolioHoldings } from './hooks/usePortfolio';
import { importTransactionsFromCSV, validateCSVImport, exportTransactionsAsCSV } from './utils/csvUtils';

function loadLinesMap() {
  try {
    const saved = localStorage.getItem('aethertrade_support_resistance');
    if (saved) return JSON.parse(saved);
  } catch (e) { console.error(e); }
  return {};
}

export default function App() {
  const [view, setView] = useState('terminal');
  const [toasts, setToasts] = useState([]);
  const [currentCapital, setCurrentCapital] = useState(10000);
  const [selectedRange, setSelectedRange] = useState('1M');
  const [selectedInterval, setSelectedInterval] = useState('1d');
  const [chartType, setChartType] = useState('line');
  const [showLevels, setShowLevels] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [linesMap, setLinesMap] = useState(loadLinesMap);
  const [isWatchlistCollapsed, setIsWatchlistCollapsed] = useState(false);

  const addToast = useCallback((message, type = 'success') => {
    const id = Date.now() + Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const { watchlist, setWatchlist, activeTicker, setActiveTicker, removeTicker, addTicker } = useWatchlist();
  const { stocks, isLoading, loadStockData, fetchBackgroundPrice, fetchPortfolioHistory } = useStockData(activeTicker, selectedRange, selectedInterval, addToast);
  const { portfolios, setPortfolios, activePortfolioId, setActivePortfolioId, addTransaction, deleteTransaction, resetPortfolio } = usePortfolio(addToast);

  const loadStockDataRef = useRef(loadStockData);
  const fetchBackgroundPriceRef = useRef(fetchBackgroundPrice);
  const setWatchlistRef = useRef(setWatchlist);
  const setActiveTickerRef = useRef(setActiveTicker);
  const watchlistRef = useRef(watchlist);

  useEffect(() => { loadStockDataRef.current = loadStockData; }, [loadStockData]);
  useEffect(() => { fetchBackgroundPriceRef.current = fetchBackgroundPrice; }, [fetchBackgroundPrice]);
  useEffect(() => { setWatchlistRef.current = setWatchlist; }, [setWatchlist]);
  useEffect(() => { setActiveTickerRef.current = setActiveTicker; }, [setActiveTicker]);
  useEffect(() => { watchlistRef.current = watchlist; }, [watchlist]);

  // Persist S&R lines
  useEffect(() => {
    localStorage.setItem('aethertrade_support_resistance', JSON.stringify(linesMap));
  }, [linesMap]);

  // Fetch portfolio histories for held tickers
  useEffect(() => {
    const active = portfolios.find(p => p.id === activePortfolioId);
    if (!active) return;
    [...new Set(active.transactions.map(t => t.ticker))].forEach(ticker => {
      if (!stocks[ticker]?.portfolioHistory) fetchPortfolioHistory(ticker);
    });
  }, [activePortfolioId, portfolios, stocks, fetchPortfolioHistory]);

  // Load active ticker + stagger sidebar fetches
  useEffect(() => {
    loadStockDataRef.current(activeTicker, selectedRange, selectedInterval, watchlistRef.current, setWatchlistRef.current, setActiveTickerRef.current);
    fetchBackgroundPriceRef.current(activeTicker);
    watchlistRef.current.filter(t => t !== activeTicker).forEach((ticker, i) => {
      setTimeout(() => fetchBackgroundPriceRef.current(ticker), (i + 1) * 2000);
    });
  }, [activeTicker, selectedRange, selectedInterval]);

  const handleRefresh = () => loadStockDataRef.current(activeTicker, selectedRange, selectedInterval, watchlistRef.current, setWatchlistRef.current, setActiveTickerRef.current);

  const activeStockPrice = stocks[activeTicker]?.price || 0;
  const activeTickerHoldings = portfolios
    .filter(port => port.holdings?.[activeTicker])
    .map(port => ({
      portfolioId: port.id,
      portfolioName: port.name,
      ...port.holdings[activeTicker]
    }));

  const handleRemoveTicker = (ticker) => removeTicker(ticker, addToast);
  const handleAddTicker = (ticker) => addTicker(ticker, addToast);

  const handleImportCSV = (csvText) => {
    try {
      const importedTxs = importTransactionsFromCSV(csvText);
      if (importedTxs.length === 0) { addToast("No transactions found in CSV.", "error"); return; }

      const choice = confirm(`Found ${importedTxs.length} valid transactions.\n\nOK = APPEND, CANCEL = REPLACE`);
      const txsByPortfolio = validateCSVImport(importedTxs, portfolios, activePortfolioId);

      const updated = portfolios.map(port => {
        const imported = txsByPortfolio[port.id];
        if (!imported) return port;
        const existing = choice ? port.transactions : [];
        const combined = [...existing, ...imported].sort((a, b) => a.timestamp - b.timestamp);
        const { holdings, realizedPL } = rebuildPortfolioHoldings(combined);
        return { ...port, transactions: combined, holdings, realizedPL };
      });

      setPortfolios(updated);

      // Fetch live prices for all imported tickers so the table updates
      const importedTickers = [...new Set(importedTxs.map(tx => tx.ticker))];
      importedTickers.forEach((ticker, i) => {
        setTimeout(() => fetchBackgroundPriceRef.current(ticker), i * 500);
      });

      addToast(`Successfully imported ${importedTxs.length} transactions!`, 'success');
    } catch (err) {
      alert(`CSV Import Failed:\n\n${err.message}`);
    }
  };

  const handleExportCSV = (portfolioId) => {
    const port = portfolios.find(p => p.id === portfolioId);
    if (!port || port.transactions.length === 0) {
      addToast("No transactions to export.", "warning");
      return;
    }
    exportTransactionsAsCSV(port.transactions, port.name);
    addToast("Transactions exported successfully!", "success");
  };

  return (
    <>
      <div className="glow-sphere glow-sphere-1"></div>
      <div className="glow-sphere glow-sphere-2"></div>

      <header className="app-header">
        <div className="header-logo">
          <div className="logo-icon"><i className="fa-solid fa-chart-line"></i></div>
          <div className="logo-text">
            <span className="logo-brand">AETHER</span>
            <span className="logo-sub">TRADE</span>
          </div>
        </div>
        <nav className="app-nav">
          <button onClick={() => setView('terminal')} className={`nav-btn ${view === 'terminal' ? 'active' : ''}`}>
            <i className="fa-solid fa-chart-line"></i> Terminal
          </button>
          <button onClick={() => setView('portfolio')} className={`nav-btn ${view === 'portfolio' ? 'active' : ''}`}>
            <i className="fa-solid fa-briefcase"></i> Portfolio
          </button>
        </nav>
      </header>

      <main className="app-workspace">
        {view === 'terminal' ? (
          <div id="viewTerminal" className={`workspace-view active ${isWatchlistCollapsed ? 'watchlist-collapsed' : ''}`}>
            <Watchlist watchlist={watchlist} activeTicker={activeTicker} setActiveTicker={setActiveTicker} stocks={stocks} onRemoveTicker={handleRemoveTicker} onAddTicker={handleAddTicker} isCollapsed={isWatchlistCollapsed} onToggleCollapse={() => setIsWatchlistCollapsed(!isWatchlistCollapsed)} />
            <ChartContainer activeTicker={activeTicker} stocks={stocks} range={selectedRange} setRange={setSelectedRange} interval={selectedInterval} setInterval={setSelectedInterval} chartType={chartType} setChartType={setChartType} showLevels={showLevels} setShowLevels={setShowLevels} zoomLevel={zoomLevel} setZoomLevel={setZoomLevel} linesMap={linesMap} setLinesMap={setLinesMap} onRefresh={handleRefresh} isLoading={isLoading} />
            <div className="panel panel-right">
              {activeTickerHoldings.length > 0 && (
                <div className="holding-panel">
                  <div className="holding-panel-header">
                    <i className="fa-solid fa-briefcase"></i> Holdings — {activeTicker}
                  </div>
                  {activeTickerHoldings.map(h => {
                    const pnl = (activeStockPrice - h.avgCost) * h.shares;
                    const pnlPct = h.avgCost ? ((activeStockPrice - h.avgCost) / h.avgCost * 100) : 0;
                    return (
                      <div key={h.portfolioId} className="holding-row">
                        <div className="holding-row-header">
                          <span className="holding-row-name">{h.portfolioName}</span>
                          <span className={`holding-row-pnl ${pnl >= 0 ? 'positive' : 'negative'}`}>
                            {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} ({pnlPct.toFixed(1)}%)
                          </span>
                        </div>
                        <div className="holding-row-details">
                          <span>{parseFloat(h.shares.toFixed(4))} shares @ ${h.avgCost.toFixed(2)}</span>
                          <span>Value: ${(h.shares * activeStockPrice).toFixed(2)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <AnalysisEngine activeTicker={activeTicker} currentPrice={stocks[activeTicker]?.price || 150.00} lines={linesMap[activeTicker] || []} setLinesMap={setLinesMap} linesMap={linesMap} currentCapital={currentCapital} setCurrentCapital={setCurrentCapital} />
            </div>
          </div>
        ) : (
          <div id="viewPortfolio" className="workspace-view active">
            <PortfolioManager portfolios={portfolios} setPortfolios={setPortfolios} activePortfolioId={activePortfolioId} setActivePortfolioId={setActivePortfolioId} stocks={stocks} onAddTransaction={addTransaction} showNotification={addToast} onFetchPrice={fetchBackgroundPrice} />
            <PerformanceHoldings portfolios={portfolios} activePortfolioId={activePortfolioId} stocks={stocks} onAddTransaction={addTransaction} onDeleteTransaction={deleteTransaction} onResetPortfolio={resetPortfolio} onImportCSV={handleImportCSV} onExportCSV={handleExportCSV} onRefreshPrices={fetchBackgroundPrice} showNotification={addToast} />
          </div>
        )}
      </main>

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </>
  );
}
