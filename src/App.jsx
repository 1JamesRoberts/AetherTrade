import { useState, useEffect, useCallback, useRef } from 'react';
import Watchlist from './components/Watchlist';
import ResearchWorkspace from './components/research/ResearchWorkspace';
import ChartContainer from './components/ChartContainer';
import AnalysisEngine from './components/AnalysisEngine';
import PortfolioManager from './components/PortfolioManager';
import PerformanceHoldings from './components/PerformanceHoldings';
import ToastContainer from './components/ToastContainer';
import AuthPage from './components/AuthPage';
import ErrorBoundary from './components/ErrorBoundary';
import WorkspaceShell from './components/layout/WorkspaceShell';
import { useStockData } from './hooks/useStockData';
import { useWatchlist } from './hooks/useWatchlist';
import { usePortfolio } from './hooks/usePortfolio';
import { useAuth } from './hooks/useAuth';
import { useSyncedRecord } from './hooks/useSyncedRecord';
import { importTransactionsFromCSV, validateCSVImport, exportTransactionsAsCSV } from './utils/csvUtils';

const EMPTY_ANNOTATIONS = {};

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
  const auth = useAuth();
  if (auth.loading) return <div className="auth-page"><p>Loading...</p></div>;
  if (!auth.user) return <AuthPage onSignUp={auth.signUp} onSignIn={auth.signIn}
    onGitHub={auth.signInWithGitHub} onGoogle={auth.signInWithGoogle} />;
  // Remount account-owned state, requests and subscriptions on account changes.
  return <Workspace key={auth.user.id} user={auth.user} signOut={auth.signOut} />;
}

function Workspace({ user, signOut }) {
  const [view, setView] = useState(() => {
    try {
      const saved = localStorage.getItem('aethertrade_active_view');
      if (['terminal', 'portfolio', 'activity'].includes(saved)) return saved;
    } catch (e) { console.error(e); }
    return 'portfolio';
  });
  const [toasts, setToasts] = useState([]);
  const [currentCapital, setCurrentCapital] = useState(10000);
  const [selectedRange, setSelectedRange] = useState(() => {
    try {
      const saved = localStorage.getItem('aethertrade_selected_range');
      if (saved && ['1D', '1W', '1M', '1Y', '5Y'].includes(saved)) return saved;
    } catch (e) { console.error(e); }
    return '1M';
  });
  const [selectedInterval, setSelectedInterval] = useState(() => {
    try {
      const saved = localStorage.getItem('aethertrade_selected_interval');
      if (saved) return saved;
    } catch (e) { console.error(e); }
    return '1d';
  });
  const [chartType, setChartType] = useState(() => {
    try {
      const saved = localStorage.getItem('aethertrade_chart_type');
      if (saved === 'line' || saved === 'candle') return saved;
    } catch (e) { console.error(e); }
    return 'line';
  });
  const [showLevels, setShowLevels] = useState(() => {
    try {
      const saved = localStorage.getItem('aethertrade_show_levels');
      return saved === null ? true : saved === 'true';
    } catch (e) { console.error(e); return false; }
  });
  const [zoomLevel, setZoomLevel] = useState(100);

  const [isWatchlistCollapsed, setIsWatchlistCollapsed] = useState(() => {
    try {
      return localStorage.getItem('aethertrade_watchlist_collapsed') === 'true';
    } catch (e) { console.error(e); return false; }
  });
  const [terminalMobileTab, setTerminalMobileTab] = useState(() => {
    try {
      const saved = localStorage.getItem('aethertrade_terminal_mobile_tab');
      if (saved && ['chart', 'company', 'watchlist', 'analysis'].includes(saved)) return saved;
    } catch (e) { console.error(e); }
    return 'chart';
  }); // 'chart' | 'company' | 'watchlist' | 'analysis'
  const [marketStatus, setMarketStatus] = useState(getMarketStatus);
  const [prefilledTrade, setPrefilledTrade] = useState(null);
  const [activityTab, setActivityTab] = useState('history');
  const [tradeRequest, setTradeRequest] = useState(0);
  const navigate = (nextView) => {
    setPrefilledTrade(null);
    if (nextView === 'activity') setActivityTab('history');
    setView(nextView);
  };
  const recordTransaction = () => {
    setPrefilledTrade(null);
    setActivityTab('trade');
    setTradeRequest(value => value + 1);
    setView('activity');
  };
  const prefillTransaction = (trade) => {
    recordTransaction();
    setPrefilledTrade({ ...trade, portfolioId: activePortfolioId });
  };

  useEffect(() => { window.scrollTo(0, 0); }, [view]);

  // Sync workspace UI preferences to localStorage
  useEffect(() => {
    localStorage.setItem('aethertrade_active_view', view);
  }, [view]);

  useEffect(() => {
    localStorage.setItem('aethertrade_selected_range', selectedRange);
  }, [selectedRange]);

  useEffect(() => {
    localStorage.setItem('aethertrade_selected_interval', selectedInterval);
  }, [selectedInterval]);

  useEffect(() => {
    localStorage.setItem('aethertrade_chart_type', chartType);
  }, [chartType]);

  useEffect(() => {
    localStorage.setItem('aethertrade_show_levels', String(showLevels));
  }, [showLevels]);

  useEffect(() => {
    localStorage.setItem('aethertrade_watchlist_collapsed', String(isWatchlistCollapsed));
  }, [isWatchlistCollapsed]);

  useEffect(() => {
    localStorage.setItem('aethertrade_terminal_mobile_tab', terminalMobileTab);
  }, [terminalMobileTab]);

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
      } else if (e.key === 'a' || e.key === 'A' || e.key === '3') {
        setActivityTab('history');
        setView('activity');
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

  const [linesMap, setLinesMap] = useSyncedRecord(user, 'chart_annotations', 'lines_map',
    'aethertrade_support_resistance', EMPTY_ANNOTATIONS, addToast);
  const { watchlist, activeTicker, setActiveTicker, removeTicker, addTicker } = useWatchlist(user, addToast);
  const { stocks, isLoading, loadStockData, fetchBackgroundPrice, fetchPortfolioHistory } = useStockData(activeTicker, selectedRange, selectedInterval, addToast);
  const {
    portfolios,
    activePortfolioId,
    setActivePortfolioId,
    addTransaction,
    editTransaction,
    deleteTransaction,
    resetPortfolio,
    importCSVTransactions,
    createPortfolio,
    renamePortfolio,
    deletePortfolio,
    updateTargetAllocations,
    updateBaseCurrency,
    executeRebalance
  } = usePortfolio(addToast, user);

  const loadStockDataRef = useRef(loadStockData);
  const fetchBackgroundPriceRef = useRef(fetchBackgroundPrice);
  const watchlistRef = useRef(watchlist);

  useEffect(() => { loadStockDataRef.current = loadStockData; }, [loadStockData]);
  useEffect(() => { fetchBackgroundPriceRef.current = fetchBackgroundPrice; }, [fetchBackgroundPrice]);
  useEffect(() => { watchlistRef.current = watchlist; }, [watchlist]);

  // Cloud annotation hydration and realtime updates are handled by useSyncedRecord.
  // Only explicit local edits persist to Supabase; received events never echo back.

  // Fetch portfolio histories for held tickers + USD/THB forex history
  useEffect(() => {
    const active = portfolios.find(p => p.id === activePortfolioId);
    if (!active) return;
    const tickersToFetch = [...new Set((active.transactions || []).map(t => t.ticker).filter(Boolean))];
    const hasThai = tickersToFetch.some(t => t.endsWith('.BK')) || activeTicker?.endsWith('.BK') || active.baseCurrency === 'THB';
    if (hasThai && !tickersToFetch.includes('USDTHB=X')) {
      tickersToFetch.push('USDTHB=X');
    }
    tickersToFetch.forEach(ticker => {
      if (!stocks[ticker]?.portfolioHistory) fetchPortfolioHistory(ticker);
    });
  }, [activePortfolioId, portfolios, stocks, activeTicker, fetchPortfolioHistory]);

  // Load active ticker + stagger sidebar fetches
  useEffect(() => {
    loadStockDataRef.current(activeTicker, selectedRange, selectedInterval);
    fetchBackgroundPriceRef.current(activeTicker);
    const timers = watchlistRef.current.filter(t => t !== activeTicker).map((ticker, i) =>
      setTimeout(() => fetchBackgroundPriceRef.current(ticker), (i + 1) * 2000));
    return () => timers.forEach(clearTimeout);
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
      const txsByPortfolio = validateCSVImport(importedTxs, portfolios, activePortfolioId, choice);

      if (!await importCSVTransactions(txsByPortfolio, choice)) return;

      // Fetch live prices for all imported tickers so the table updates
      const importedTickers = [...new Set(importedTxs.map(tx => tx.ticker))];
      importedTickers.forEach((ticker, i) => {
        setTimeout(() => fetchBackgroundPriceRef.current(ticker), i * 500);
      });


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
    const count = port.transactions.length;
    const confirmed = window.confirm(`Are you sure you want to export ${count} transaction${count === 1 ? '' : 's'} from "${port.name}" to CSV?`);
    if (!confirmed) return;

    exportTransactionsAsCSV(port.transactions, port.name);
    addToast("Transactions exported successfully!", "success");
  };


  return (
    <>
      <WorkspaceShell view={view} onNavigate={navigate} onRecord={recordTransaction}
        user={user} signOut={signOut} marketStatus={marketStatus}
        onLoadReviewData={import.meta.env.MODE === 'review' ? async () => {
          const sample = await import('../docs/fixtures/redesign-review.csv?raw');
          await handleImportCSV(sample.default);
        } : undefined}>
        {view === 'terminal' ? (
          <ResearchWorkspace
            section={terminalMobileTab}
            onSectionChange={setTerminalMobileTab}
            ticker={activeTicker}
            stock={stocks[activeTicker]}
            count={watchlist.length}
            collapsed={isWatchlistCollapsed}
            onRefresh={handleRefresh}
            loading={isLoading}
            watchlist={<Watchlist
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
            />}
            chart={<ChartContainer
              workspaceSection={terminalMobileTab === 'company' ? 'company' : 'chart'}
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
            />}
            analysis={<AnalysisEngine
              activeTicker={activeTicker}
              currentPrice={stocks[activeTicker]?.price || 0}
              lines={linesMap[activeTicker] || []}
              setLinesMap={setLinesMap}
              linesMap={linesMap}
              currentCapital={currentCapital}
              setCurrentCapital={setCurrentCapital}
              activeTickerHoldings={activeTickerHoldings}
              activeStockPrice={activeStockPrice}
              liveRawValues={stocks[activeTicker]?.liveRawValues || []}
            />}
          />
        ) : (
          <div
            id="viewPortfolio"
            className={`workspace-view active ${view === 'activity' ? 'activity-workspace' : ''}`}
          >
            <ErrorBoundary name="Portfolio Manager">
              <PortfolioManager
                key={`${view}:${activityTab}:${tradeRequest}`}
                initialTab={view === 'activity' ? activityTab : 'trade'}
                showAllocation={false}
                overview={view === 'portfolio' ? (
                  <ErrorBoundary name="Performance & Holdings">
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
                      onPrefillTrade={prefillTransaction}
                      showNotification={addToast}
                    />
                  </ErrorBoundary>
                ) : null}
                portfolios={portfolios}
                activePortfolioId={activePortfolioId}
                setActivePortfolioId={setActivePortfolioId}
                stocks={stocks}
                onAddTransaction={addTransaction}
                onEditTransaction={editTransaction}
                onDeleteTransaction={deleteTransaction}
                onCreatePortfolio={createPortfolio}
                onRenamePortfolio={renamePortfolio}
                onDeletePortfolio={deletePortfolio}
                onUpdateBaseCurrency={updateBaseCurrency}
                prefilledTrade={prefilledTrade}
                onClearPrefilledTrade={() => setPrefilledTrade(null)}
                showNotification={addToast}
                onFetchPrice={fetchBackgroundPrice}
              />
            </ErrorBoundary>
          </div>
        )}
      </WorkspaceShell>

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </>
  );
}
