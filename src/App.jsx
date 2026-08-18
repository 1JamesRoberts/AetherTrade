import { useState, useEffect, useCallback, useRef } from 'react';
import Watchlist from './components/Watchlist';
import ChartContainer from './components/ChartContainer';
import AnalysisEngine from './components/AnalysisEngine';
import PortfolioManager from './components/PortfolioManager';
import PerformanceHoldings from './components/PerformanceHoldings';
import ToastContainer from './components/ToastContainer';
import AuthPage from './components/AuthPage';
import { useStockData } from './hooks/useStockData';
import { useWatchlist } from './hooks/useWatchlist';
import { usePortfolio } from './hooks/usePortfolio';
import { useAuth } from './hooks/useAuth';
import { importTransactionsFromCSV, validateCSVImport, exportTransactionsAsCSV } from './utils/csvUtils';

function loadLinesMap() {
  try {
    const saved = localStorage.getItem('aethertrade_support_resistance');
    if (saved) return JSON.parse(saved);
  } catch (e) { console.error(e); }
  return {};
}

function getMarketStatus() {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hourCycle: 'h23',
      weekday: 'short',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric'
    });
    const parts = formatter.formatToParts(now);
    const partObj = {};
    parts.forEach(p => { partObj[p.type] = p.value; });

    const weekdayStr = partObj.weekday || 'Mon';
    const isWeekday = !['Sat', 'Sun'].includes(weekdayStr);
    const hour = parseInt(partObj.hour, 10) || 0;
    const minute = parseInt(partObj.minute, 10) || 0;
    const second = parseInt(partObj.second, 10) || 0;
    const timeInMinutes = hour * 60 + minute;

    // NYSE hours: 9:30 AM (570m) - 4:00 PM (960m)
    const isOpen = isWeekday && timeInMinutes >= 570 && timeInMinutes < 960;
    const isPre = isWeekday && timeInMinutes >= 240 && timeInMinutes < 570;
    const isPost = isWeekday && timeInMinutes >= 960 && timeInMinutes < 1200;

    let label = 'Market Closed';
    let statusClass = 'closed';
    if (isOpen) {
      label = 'US Market Open';
      statusClass = 'open';
    } else if (isPre) {
      label = 'Pre-Market';
      statusClass = 'pre';
    } else if (isPost) {
      label = 'After-Hours';
      statusClass = 'post';
    }

    const pad = (n) => String(n).padStart(2, '0');
    const timeStr = `${pad(hour)}:${pad(minute)}:${pad(second)} EST`;
    return { label, statusClass, timeStr };
  } catch {
    return { label: 'US Market Live', statusClass: 'open', timeStr: 'EST' };
  }
}

export default function App() {
  const { user, loading: authLoading, signUp, signIn, signInWithGitHub, signInWithGoogle, signOut } = useAuth();
  const [view, setView] = useState('terminal');
  const [toasts, setToasts] = useState([]);
  const [currentCapital, setCurrentCapital] = useState(10000);
  const [selectedRange, setSelectedRange] = useState('1M');
  const [selectedInterval, setSelectedInterval] = useState('1d');
  const [chartType, setChartType] = useState('line');
  const [showLevels, setShowLevels] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [linesMap, setLinesMap] = useState(loadLinesMap);
  const [isWatchlistCollapsed, setIsWatchlistCollapsed] = useState(false);
  const [terminalMobileTab, setTerminalMobileTab] = useState('chart'); // 'chart' | 'watchlist' | 'analysis'
  const [marketStatus, setMarketStatus] = useState(getMarketStatus);

  // Live Market Status Clock
  useEffect(() => {
    const timer = setInterval(() => {
      setMarketStatus(getMarketStatus());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Global Keyboard Shortcuts: T for Terminal, P for Portfolio
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      if (e.key === 't' || e.key === 'T' || e.key === '1') {
        setView('terminal');
      } else if (e.key === 'p' || e.key === 'P' || e.key === '2') {
        setView('portfolio');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const addToast = useCallback((message, type = 'success') => {
    const id = Date.now() + Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const { watchlist, activeTicker, setActiveTicker, removeTicker, addTicker } = useWatchlist();
  const { stocks, isLoading, loadStockData, fetchBackgroundPrice, fetchPortfolioHistory } = useStockData(activeTicker, selectedRange, selectedInterval, addToast);
  const {
    portfolios,
    setPortfolios,
    activePortfolioId,
    setActivePortfolioId,
    addTransaction,
    deleteTransaction,
    resetPortfolio,
    importCSVTransactions,
    createPortfolio,
    renamePortfolio,
    deletePortfolio,
    updateTargetAllocations,
    executeRebalance
  } = usePortfolio(addToast, user);

  const loadStockDataRef = useRef(loadStockData);
  const fetchBackgroundPriceRef = useRef(fetchBackgroundPrice);
  const watchlistRef = useRef(watchlist);

  useEffect(() => { loadStockDataRef.current = loadStockData; }, [loadStockData]);
  useEffect(() => { fetchBackgroundPriceRef.current = fetchBackgroundPrice; }, [fetchBackgroundPrice]);
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
    loadStockDataRef.current(activeTicker, selectedRange, selectedInterval);
    fetchBackgroundPriceRef.current(activeTicker);
    watchlistRef.current.filter(t => t !== activeTicker).forEach((ticker, i) => {
      setTimeout(() => fetchBackgroundPriceRef.current(ticker), (i + 1) * 2000);
    });
  }, [activeTicker, selectedRange, selectedInterval]);

  const handleRefresh = () => loadStockDataRef.current(activeTicker, selectedRange, selectedInterval);

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

  const handleImportCSV = async (csvText) => {
    try {
      const importedTxs = importTransactionsFromCSV(csvText);
      if (importedTxs.length === 0) { addToast("No transactions found in CSV.", "error"); return; }

      const choice = confirm(`Found ${importedTxs.length} valid transactions.\n\nOK = APPEND, CANCEL = REPLACE`);
      const txsByPortfolio = validateCSVImport(importedTxs, portfolios, activePortfolioId);

      await importCSVTransactions(txsByPortfolio, choice);

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

  if (authLoading) {
    return (
      <div className="auth-page">
        <div className="auth-card" style={{ textAlign: 'center', padding: '40px' }}>
          <div className="logo-icon" style={{ margin: '0 auto 16px' }}><i className="fa-solid fa-chart-line"></i></div>
          <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <AuthPage
        onSignUp={signUp}
        onSignIn={signIn}
        onGitHub={signInWithGitHub}
        onGoogle={signInWithGoogle}
      />
    );
  }

  return (
    <>
      <div className="glow-sphere glow-sphere-1"></div>
      <div className="glow-sphere glow-sphere-2"></div>

      <header className="app-header">
        <div className="header-left">
          <div className="header-logo" onClick={() => setView('terminal')} title="AetherTrade">
            <div className="logo-icon"><i className="fa-solid fa-chart-line"></i></div>
            <div className="logo-text">
              <span className="logo-brand">AETHER</span>
              <span className="logo-sub">TRADE</span>
            </div>
          </div>

          <div className="market-status-pill" title={`NYSE / NASDAQ Status: ${marketStatus.label}`}>
            <span className={`pulse-indicator ${marketStatus.statusClass}`}></span>
            <span className="market-status-label">{marketStatus.label}</span>
            <span className="market-time-sep">•</span>
            <span className="market-time tabular-nums">{marketStatus.timeStr}</span>
          </div>
        </div>

        <div className="header-center">
          <nav className="app-nav">
            <button
              onClick={() => setView('terminal')}
              className={`nav-btn ${view === 'terminal' ? 'active' : ''}`}
              title="Terminal View (Shortcut: T or 1)"
            >
              <i className="fa-solid fa-chart-line"></i>
              <span>Terminal</span>
              <span className="nav-shortcut">T</span>
            </button>
            <button
              onClick={() => setView('portfolio')}
              className={`nav-btn ${view === 'portfolio' ? 'active' : ''}`}
              title="Portfolio View (Shortcut: P or 2)"
            >
              <i className="fa-solid fa-briefcase"></i>
              <span>Portfolio</span>
              <span className="nav-shortcut">P</span>
            </button>
          </nav>
        </div>

        <div className="header-right">
          <div className="user-profile-badge" title={`Signed in as ${user.email}`}>
            <div className="user-avatar">
              {(user.email || 'U')[0].toUpperCase()}
            </div>
            <span className="user-email-text">{user.email}</span>
          </div>
          <button className="btn-signout" onClick={signOut} title="Sign out of account">
            <i className="fa-solid fa-right-from-bracket"></i>
          </button>
        </div>
      </header>

      <main className="app-workspace">
        {view === 'terminal' ? (
          <div
            id="viewTerminal"
            className={`workspace-view active mobile-tab-${terminalMobileTab} ${isWatchlistCollapsed ? 'watchlist-collapsed' : ''}`}
          >
            {/* Mobile Workspace Segmented Control (Visible on screens < 900px) */}
            <div className="terminal-mobile-nav">
              <button
                type="button"
                className={`mobile-tab-btn ${terminalMobileTab === 'chart' ? 'active' : ''}`}
                onClick={() => setTerminalMobileTab('chart')}
              >
                <i className="fa-solid fa-chart-line"></i>
                <span>Chart ({activeTicker})</span>
              </button>
              <button
                type="button"
                className={`mobile-tab-btn ${terminalMobileTab === 'watchlist' ? 'active' : ''}`}
                onClick={() => setTerminalMobileTab('watchlist')}
              >
                <i className="fa-solid fa-star"></i>
                <span>Watchlist ({watchlist.length})</span>
              </button>
              <button
                type="button"
                className={`mobile-tab-btn ${terminalMobileTab === 'analysis' ? 'active' : ''}`}
                onClick={() => setTerminalMobileTab('analysis')}
              >
                <i className="fa-solid fa-layer-group"></i>
                <span>Analysis</span>
              </button>
            </div>

            <Watchlist
              watchlist={watchlist}
              activeTicker={activeTicker}
              setActiveTicker={(ticker) => {
                setActiveTicker(ticker);
                // On mobile, auto-switch to chart when selecting a stock from watchlist
                if (window.innerWidth < 900) {
                  setTerminalMobileTab('chart');
                }
              }}
              stocks={stocks}
              onRemoveTicker={handleRemoveTicker}
              onAddTicker={handleAddTicker}
              isCollapsed={isWatchlistCollapsed}
              onToggleCollapse={() => setIsWatchlistCollapsed(!isWatchlistCollapsed)}
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
              onRefresh={handleRefresh}
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
              activeTickerHoldings={activeTickerHoldings}
              activeStockPrice={activeStockPrice}
              liveRawValues={stocks[activeTicker]?.liveRawValues || []}
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
              onAddTransaction={addTransaction}
              onDeleteTransaction={deleteTransaction}
              onCreatePortfolio={createPortfolio}
              onRenamePortfolio={renamePortfolio}
              onDeletePortfolio={deletePortfolio}
              showNotification={addToast}
              onFetchPrice={fetchBackgroundPrice}
            />
            <PerformanceHoldings
              portfolios={portfolios}
              activePortfolioId={activePortfolioId}
              stocks={stocks}
              onAddTransaction={addTransaction}
              onResetPortfolio={resetPortfolio}
              onImportCSV={handleImportCSV}
              onExportCSV={handleExportCSV}
              onRefreshPrices={fetchBackgroundPrice}
              onFetchPortfolioHistory={fetchPortfolioHistory}
              onUpdateTargetAllocations={updateTargetAllocations}
              onExecuteRebalance={executeRebalance}
              showNotification={addToast}
            />
          </div>
        )}
      </main>

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </>
  );
}
