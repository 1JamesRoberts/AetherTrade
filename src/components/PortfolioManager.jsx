import { useState, useEffect, useRef, useMemo } from 'react';
import { Chart, registerables } from 'chart.js';
import {
  detectTickerCurrency,
  getCurrencySymbol,
  formatMoney,
  convertCurrency
} from '../utils/currencyUtils';

Chart.register(...registerables);

const ALLOCATION_COLORS = [
  '#06B6D4', // Cyan
  '#10B981', // Emerald
  '#3B82F6', // Blue
  '#8B5CF6', // Purple
  '#F59E0B', // Amber
  '#EC4899', // Pink
  '#14B8A6', // Teal
  '#6366F1', // Indigo
  '#F97316', // Orange
  '#84CC16', // Lime
];

export default function PortfolioManager({
  portfolios,
  activePortfolioId,
  setActivePortfolioId,
  stocks,
  onAddTransaction,
  onEditTransaction,
  onDeleteTransaction,
  onCreatePortfolio,
  onRenamePortfolio,
  onDeletePortfolio,
  onUpdateBaseCurrency,
  prefilledTrade,
  showNotification,
  onFetchPrice
}) {
  const allocationCanvasRef = useRef(null);
  const allocationChartRef = useRef(null);

  // Sub-tab selection ('trade' | 'history')
  const [activeSubTab, setActiveSubTab] = useState('trade');

  // Editing state for existing transaction
  const [editingTxIndex, setEditingTxIndex] = useState(null);

  // Form states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTicker, setSelectedTicker] = useState(null);
  const [txType, setTxType] = useState('BUY'); // 'BUY' | 'SELL'
  const [shares, setShares] = useState(10);
  const [price, setPrice] = useState(185.50);

  // Get today's local date YYYY-MM-DD
  const getTodayLocalDate = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [txDate, setTxDate] = useState(getTodayLocalDate);
  const [fees, setFees] = useState(0.00);

  // Search filter autocomplete
  const [searchResults, setSearchResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);

  const activePortfolio = portfolios.find(p => p.id === activePortfolioId) || {
    id: 'default',
    name: 'Primary Portfolio',
    holdings: {},
    transactions: [],
    realizedPL: 0
  };

  const [accountName, setAccountName] = useState(activePortfolio.name);

  // Transaction Ledger Filter States
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState('ALL'); // 'ALL' | 'BUY' | 'SELL' | 'DIVIDEND'
  const [ledgerSearchQuery, setLedgerSearchQuery] = useState('');

  // Reset filters and sync accountName input when active portfolio changes
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) {
        setAccountName(activePortfolio.name);
        setLedgerTypeFilter('ALL');
        setLedgerSearchQuery('');
      }
    });
    return () => { active = false; };
  }, [activePortfolioId, activePortfolio.name]);

  // Memoized filtered transactions retaining original 0-indexed positions
  const filteredTransactions = useMemo(() => {
    const allTxs = (activePortfolio?.transactions || []).map((tx, originalIndex) => ({ tx, originalIndex }));
    return allTxs.filter(({ tx }) => {
      if (ledgerTypeFilter !== 'ALL' && tx.type !== ledgerTypeFilter) {
        return false;
      }
      if (ledgerSearchQuery.trim()) {
        const q = ledgerSearchQuery.trim();
        const qUpper = q.toUpperCase();
        const qLower = q.toLowerCase();
        const ticker = (tx.ticker || '').toUpperCase();
        // Match ticker prefix (e.g. 'PL' matches 'PLTR', 'PLUG', but NOT 'AAPL')
        const tickerMatch = ticker.startsWith(qUpper);
        const accountMatch = (tx.account || '').toLowerCase().includes(qLower);
        if (!tickerMatch && !accountMatch) return false;
      }
      return true;
    });
  }, [activePortfolio?.transactions, ledgerTypeFilter, ledgerSearchQuery]);

  // Pre-fill form when user clicks "Fill in Form" from Rebalance Studio
  useEffect(() => {
    if (!prefilledTrade) return;
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      setActiveSubTab('trade');
      if (prefilledTrade.ticker) {
        setSelectedTicker(prefilledTrade.ticker);
        setSearchQuery(prefilledTrade.ticker);
      }
      if (prefilledTrade.type) setTxType(prefilledTrade.type);
      if (prefilledTrade.shares) setShares(parseFloat(Number(prefilledTrade.shares).toFixed(4)));
      if (prefilledTrade.price) setPrice(parseFloat(Number(prefilledTrade.price).toFixed(2)));
      if (prefilledTrade.account) setAccountName(prefilledTrade.account);
    });
    return () => { active = false; };
  }, [prefilledTrade]);

  // Handle Portfolio Switch
  const handlePortfolioSelect = (e) => {
    const nextId = e.target.value;
    setActivePortfolioId(nextId);
    const targetPort = portfolios.find(p => p.id === nextId);
    if (targetPort) setAccountName(targetPort.name);
    setSelectedTicker(null);
    setSearchQuery('');
    setShowDropdown(false);
  };

  // Create Portfolio
  const handleCreatePortfolio = () => {
    const name = prompt('Enter a name for the new portfolio account:', 'Secondary Portfolio');
    if (name && name.trim()) {
      if (onCreatePortfolio) {
        onCreatePortfolio(name.trim());
      }
    }
  };

  // Rename Portfolio
  const handleRenamePortfolio = () => {
    const newName = prompt(`Enter new name for portfolio "${activePortfolio.name}":`, activePortfolio.name);
    if (newName && newName.trim() && newName.trim() !== activePortfolio.name) {
      if (onRenamePortfolio) {
        onRenamePortfolio(activePortfolio.id, newName.trim());
      }
    }
  };

  // Delete Portfolio
  const handleDeletePortfolio = () => {
    if (portfolios.length <= 1) {
      showNotification('Cannot delete the only remaining portfolio account.', 'warning');
      return;
    }
    const confirmDelete = confirm(`Are you sure you want to delete portfolio "${activePortfolio.name}"?\nAll associated holdings and audit logs will be permanently deleted.`);
    if (!confirmDelete) return;

    if (onDeletePortfolio) {
      onDeletePortfolio(activePortfolio.id);
    }
  };

  const portfolioSearchRef = useRef(null);
  const stocksRef = useRef(stocks);
  const [isSearchingServer, setIsSearchingServer] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);

  // Keep stocksRef current without restarting search debounce
  useEffect(() => {
    stocksRef.current = stocks;
  });

  // Dismiss dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (portfolioSearchRef.current && !portfolioSearchRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Autocomplete filter search input change
  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearchQuery(val);
    const trimmed = val.trim();

    if (trimmed === '') {
      setSearchResults([]);
      setShowDropdown(false);
      setIsSearchingServer(false);
      setActiveSuggestionIndex(0);
      return;
    }

    const currentStocks = stocksRef.current || {};
    const qUpper = trimmed.toUpperCase();
    const qLower = trimmed.toLowerCase();

    const localMatches = Object.values(currentStocks).filter(stock => {
      const ticker = (stock.ticker || '').toUpperCase();
      const name = (stock.name || '').toLowerCase();
      // Match ticker prefix/exact or company name contains query
      const tickerMatch = ticker.startsWith(qUpper);
      const nameMatch = name.includes(qLower);
      return tickerMatch || nameMatch;
    }).sort((a, b) => {
      const aTicker = (a.ticker || '').toUpperCase();
      const bTicker = (b.ticker || '').toUpperCase();
      // 1. Exact ticker matches first
      if (aTicker === qUpper && bTicker !== qUpper) return -1;
      if (bTicker === qUpper && aTicker !== qUpper) return 1;
      // 2. Ticker prefix matches second
      const aStarts = aTicker.startsWith(qUpper);
      const bStarts = bTicker.startsWith(qUpper);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      // 3. Alphabetical fallback
      return aTicker.localeCompare(bTicker);
    }).map(s => ({
      ticker: s.ticker,
      name: s.name || `${s.ticker} Stock`,
      price: s.price || 0,
      exchange: s.exchange || 'US',
      type: s.type || 'Stock'
    }));

    setSearchResults(localMatches);
    setShowDropdown(true);
    setActiveSuggestionIndex(0);
    if (trimmed.length >= 2) {
      setIsSearchingServer(true);
    }
  };

  // Debounced search with server fallback
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      return;
    }

    const controller = new AbortController();

    const timer = setTimeout(async () => {
      try {
        setIsSearchingServer(true);
        const res = await fetch(`/api/stock/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json.status === 'ok' && json.data) {
          const currentStocks = stocksRef.current || {};
          const serverItems = json.data.map(d => ({
            ticker: d.symbol,
            name: d.name,
            price: currentStocks[d.symbol]?.price || 0,
            exchange: d.exchange,
            type: d.type
          }));

          setSearchResults(prev => {
            const seen = new Set(prev.map(m => m.ticker));
            const combined = [...prev];
            for (const item of serverItems) {
              if (!seen.has(item.ticker)) {
                seen.add(item.ticker);
                combined.push(item);
              }
            }
            return combined;
          });
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.warn('Portfolio server search error:', err);
        }
      } finally {
        setIsSearchingServer(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery]);

  // Select stock from search dropdown autocomplete list
  const handleSelectStock = async (stock) => {
    const sym = stock.ticker || stock.symbol;
    setSelectedTicker(sym);
    setSearchQuery(sym);
    setShowDropdown(false);
    const livePrice = stock.price || stocks[sym]?.price;
    if (livePrice && txType !== 'DIVIDEND') {
      setPrice(livePrice);
    }
    if (txType === 'DIVIDEND') {
      const owned = activePortfolio.holdings[sym]?.shares;
      if (owned && owned > 0) {
        setShares(parseFloat(Number(owned).toFixed(4)));
      }
    }
    if (onFetchPrice) {
      const fetched = await onFetchPrice(sym);
      if (!fetched && !livePrice) {
        showNotification(`Fetching price data for "${sym}"...`, 'info');
      }
    }
  };

  const handleAddCustomSymbol = async () => {
    const customTicker = searchQuery.toUpperCase().trim();
    if (customTicker) {
      setSelectedTicker(customTicker);
      setSearchQuery(customTicker);
      setShowDropdown(false);
      const existing = stocks[customTicker];
      const livePrice = existing?.price;
      if (livePrice && txType !== 'DIVIDEND') {
        setPrice(livePrice);
      }
      if (txType === 'DIVIDEND') {
        const owned = activePortfolio.holdings[customTicker]?.shares;
        if (owned && owned > 0) {
          setShares(parseFloat(Number(owned).toFixed(4)));
        }
      }
      if (onFetchPrice) {
        const fetched = await onFetchPrice(customTicker);
        if (!fetched && !livePrice) {
          showNotification(`Fetching price data for "${customTicker}"...`, 'info');
        }
      }
    }
  };

  const handleSearchKeyDown = (e) => {
    const totalItems = searchResults.length + 1; // +1 for custom add
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSuggestionIndex((prev) => (prev + 1) % totalItems);
      setShowDropdown(true);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSuggestionIndex((prev) => (prev - 1 + totalItems) % totalItems);
      setShowDropdown(true);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeSuggestionIndex >= 0 && activeSuggestionIndex < searchResults.length) {
        handleSelectStock(searchResults[activeSuggestionIndex]);
      } else {
        handleAddCustomSymbol();
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  useEffect(() => {
    let active = true;
    if (editingTxIndex === null && selectedTicker && stocks[selectedTicker]?.price && txType !== 'DIVIDEND') {
      Promise.resolve().then(() => {
        if (active && editingTxIndex === null) setPrice(stocks[selectedTicker].price);
      });
    }
    return () => { active = false; };
  }, [selectedTicker, stocks, txType, editingTxIndex]);

  // Transaction fields inputs conversions
  const cleanFloat = (val) => {
    return parseFloat(String(val).replace(/,/g, '').trim());
  };

  // Start editing existing transaction
  const handleStartEdit = (index, tx) => {
    setEditingTxIndex(index);
    setActiveSubTab('trade');
    setSelectedTicker(tx.ticker);
    setSearchQuery(tx.ticker);
    setTxType(tx.type || 'BUY');
    setShares(parseFloat(Number(tx.shares || 0).toFixed(6)));
    setPrice(parseFloat(Number(tx.price !== undefined ? tx.price : 0).toFixed(4)));
    setFees(tx.fees !== undefined ? parseFloat(tx.fees) || 0 : 0);
    if (tx.account) setAccountName(tx.account);
    if (tx.timestamp) {
      const d = new Date(tx.timestamp);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      setTxDate(`${year}-${month}-${day}`);
    }
  };

  // Cancel editing existing transaction
  const handleCancelEdit = () => {
    setEditingTxIndex(null);
    setSelectedTicker(null);
    setSearchQuery('');
    setShares(10);
    setPrice(185.50);
    setFees(0.00);
    setTxDate(getTodayLocalDate());
  };

  // Record or Update transaction submit
  const handleRecordTransaction = () => {
    if (!selectedTicker) {
      alert("Please select a stock asset first.");
      return;
    }

    const stockData = stocks[selectedTicker];
    if (txType !== 'DIVIDEND' && (!stockData || !stockData.price || stockData.price <= 0)) {
      showNotification(`"${selectedTicker}" does not exist or has no valid price data. Please check the symbol.`, 'error');
      return;
    }

    const sharesQty = cleanFloat(shares);
    const pricePerShare = cleanFloat(price);
    const txFees = cleanFloat(fees) || 0;

    if (isNaN(sharesQty) || sharesQty <= 0) {
      alert("Please enter a valid quantity of shares.");
      return;
    }
    if (isNaN(pricePerShare) || (txType !== 'DIVIDEND' && pricePerShare <= 0) || (txType === 'DIVIDEND' && pricePerShare < 0)) {
      alert(txType === 'DIVIDEND' ? "Please enter a valid non-negative dividend payout per share." : "Please enter a valid price per share.");
      return;
    }
    if (isNaN(txFees) || txFees < 0) {
      alert("Please enter a valid non-negative fee/tax amount.");
      return;
    }

    if (txDate) {
      const selectedDate = new Date(txDate + 'T00:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (selectedDate > today) {
        alert("Invalid Transaction Date: Transactions cannot be recorded with a future date.");
        return;
      }
    }

    if (txType === 'SELL' && editingTxIndex === null) {
      const holding = activePortfolio.holdings[selectedTicker];
      if (!holding || holding.shares + 1e-9 < sharesQty) {
        alert(`Insufficient shares. You are attempting to sell ${sharesQty} shares of ${selectedTicker}, but you only own ${holding ? holding.shares : 0} shares.`);
        return;
      }
    }

    const timestamp = txDate ? new Date(txDate + 'T00:00:00').getTime() : Date.now();
    const finalTxData = {
      timestamp: timestamp,
      ticker: selectedTicker,
      type: txType,
      shares: sharesQty,
      price: pricePerShare,
      fees: txFees,
      account: accountName.trim() || 'Default'
    };

    if (editingTxIndex !== null && onEditTransaction) {
      onEditTransaction(activePortfolio.id, editingTxIndex, finalTxData);
      setEditingTxIndex(null);
    } else {
      onAddTransaction(activePortfolio.id, finalTxData);
    }

    // Reset inputs
    setShares(10);
    setFees(0.00);
    setSearchQuery('');
    setSelectedTicker(null);
  };

  // Estimated total calculation
  const selectedCurr = detectTickerCurrency(selectedTicker);
  const qtyVal = cleanFloat(shares) || 0;
  const priceVal = cleanFloat(price) || 0;
  const feeVal = cleanFloat(fees) || 0;
  const gross = qtyVal * priceVal;
  const net = txType === 'BUY' ? (gross + feeVal) : Math.max(0, gross - feeVal);

  const baseCurrency = activePortfolio.baseCurrency || 'USD';
  const fxRate = parseFloat(stocks['USDTHB=X']?.price) || 35.5;

  const { holdingsList, totalAssetValue } = useMemo(() => {
    let total = 0;
    const keys = Object.keys(activePortfolio.holdings || {});
    const list = keys
      .filter(t => (activePortfolio.holdings[t]?.shares || 0) > 0)
      .map(ticker => {
        const holding = activePortfolio.holdings[ticker];
        const stockMeta = stocks[ticker] || { price: holding.avgCost, name: `${ticker} Stock` };
        const stockPrice = stockMeta.price || holding.avgCost;
        const nativeMarketValue = holding.shares * stockPrice;
        const assetCurrency = detectTickerCurrency(ticker);
        const baseMarketValue = convertCurrency(nativeMarketValue, assetCurrency, baseCurrency, fxRate);
        total += baseMarketValue;
        return {
          ticker,
          name: stockMeta.name || `${ticker} Stock`,
          shares: holding.shares,
          price: stockPrice,
          currency: assetCurrency,
          marketValue: nativeMarketValue,
          baseMarketValue
        };
      })
      .sort((a, b) => (b.baseMarketValue || 0) - (a.baseMarketValue || 0));
    return { holdingsList: list, totalAssetValue: total };
  }, [activePortfolio.holdings, stocks, baseCurrency, fxRate]);

  // Render Allocation Doughnut Chart using Chart.js on holdings changes
  useEffect(() => {
    if (!allocationCanvasRef.current) return;

    if (allocationChartRef.current) {
      allocationChartRef.current.destroy();
      allocationChartRef.current = null;
    }

    if (holdingsList.length === 0 || totalAssetValue === 0) {
      return;
    }

    const ctx = allocationCanvasRef.current.getContext('2d');
    allocationChartRef.current = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: holdingsList.map(h => h.ticker),
        datasets: [{
          data: holdingsList.map(h => parseFloat(Number(h.baseMarketValue || 0).toFixed(2))),
          backgroundColor: ALLOCATION_COLORS.slice(0, holdingsList.length),
          borderColor: 'rgba(13, 19, 33, 0.95)',
          borderWidth: 3,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#060912',
            titleColor: '#06B6D4',
            bodyColor: '#ffffff',
            borderColor: 'rgba(255, 255, 255, 0.12)',
            borderWidth: 1,
            titleFont: { family: 'Outfit', weight: '700', size: 12 },
            bodyFont: { family: 'JetBrains Mono', size: 11 },
            padding: 10,
            cornerRadius: 8,
            displayColors: false,
            callbacks: {
              label: function (context) {
                const val = context.parsed;
                const pct = totalAssetValue > 0 ? (val / totalAssetValue) * 100 : 0;
                return ` ${context.label}: ${formatMoney(val, baseCurrency)} (${pct.toFixed(1)}%)`;
              }
            }
          }
        },
        cutout: '72%'
      }
    });

    return () => {
      if (allocationChartRef.current) {
        allocationChartRef.current.destroy();
        allocationChartRef.current = null;
      }
    };
  }, [holdingsList, totalAssetValue, baseCurrency]);

  // Click outside listener for autocomplete closing
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (!e.target.closest('.portfolio-search-box')) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, []);

  return (
    <section className="panel panel-portfolio-left" aria-label="Portfolio Allocations">
      {/* Portfolio Header with Account Switcher & Base Currency Toggle */}
      <div className="panel-header portfolio-header-bar">
        <h2 className="panel-title">
          <i className="fa-solid fa-briefcase"></i> Portfolio Manager
        </h2>
        <div className="portfolio-actions-cluster">
          <div className="portfolio-currency-toggle" title="Portfolio Base Currency">
            <button
              type="button"
              onClick={() => onUpdateBaseCurrency && onUpdateBaseCurrency(activePortfolio.id, 'USD')}
              className={`currency-toggle-btn ${baseCurrency !== 'THB' ? 'active' : ''}`}
            >
              $ USD
            </button>
            <button
              type="button"
              onClick={() => onUpdateBaseCurrency && onUpdateBaseCurrency(activePortfolio.id, 'THB')}
              className={`currency-toggle-btn ${baseCurrency === 'THB' ? 'active' : ''}`}
            >
              ฿ THB
            </button>
          </div>
          <div className="portfolio-select-wrap">
            <select
              id="portfolioSelector"
              value={activePortfolioId}
              onChange={handlePortfolioSelect}
              className="portfolio-account-select"
              title="Select Active Portfolio"
            >
              {portfolios.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <i className="fa-solid fa-chevron-down select-caret"></i>
          </div>
          <button
            type="button"
            onClick={handleCreatePortfolio}
            id="btnCreatePortfolio"
            className="btn-portfolio-action btn-add-portfolio"
            title="Create new portfolio"
            aria-label="Create new portfolio"
          >
            <i className="fa-solid fa-plus"></i>
          </button>
          <button
            type="button"
            onClick={handleRenamePortfolio}
            id="btnRenamePortfolio"
            className="btn-portfolio-action btn-edit-portfolio"
            title="Rename active portfolio"
            aria-label="Rename active portfolio"
          >
            <i className="fa-solid fa-pen"></i>
          </button>
          <button
            type="button"
            onClick={handleDeletePortfolio}
            id="btnDeletePortfolio"
            className="btn-portfolio-action btn-delete-portfolio"
            title="Delete active portfolio"
            aria-label="Delete active portfolio"
          >
            <i className="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </div>

      {/* Section 1: Asset Allocation Donut Chart */}
      <div className="analysis-section allocation-section">
        <div className="section-subtitle">
          <span>Asset Allocation</span>
          <span className="allocation-count-badge tabular-nums">
            {holdingsList.length} {holdingsList.length === 1 ? 'Asset' : 'Assets'}
          </span>
        </div>

        {holdingsList.length > 0 && totalAssetValue > 0 ? (
          <>
            <div className="donut-chart-container">
              <canvas ref={allocationCanvasRef}></canvas>
              <div className="donut-center-info">
                <span className="donut-center-label">Total Value</span>
                <span className="donut-center-value tabular-nums">
                  {formatMoney(totalAssetValue, baseCurrency)}
                </span>
                <span className="donut-center-sub">{holdingsList.length} Active Holdings</span>
              </div>
            </div>

            {/* Allocation Legend List */}
            <div className="allocation-legend-list">
              {holdingsList.map((item, idx) => {
                const weight = totalAssetValue > 0 ? (item.baseMarketValue / totalAssetValue) * 100 : 0;
                const color = ALLOCATION_COLORS[idx % ALLOCATION_COLORS.length];
                return (
                  <div key={item.ticker} className="allocation-legend-item">
                    <div className="legend-left">
                      <span className="legend-color-dot" style={{ backgroundColor: color }}></span>
                      <span className="legend-ticker">{item.ticker}</span>
                      <span className="legend-shares tabular-nums">{parseFloat(item.shares.toFixed(4))} sh</span>
                    </div>
                    <div className="legend-right">
                      <span className="legend-value tabular-nums">
                        {formatMoney(item.baseMarketValue, baseCurrency)}
                      </span>
                      <span className="legend-weight-pill tabular-nums">
                        {weight.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="empty-allocation-card">
            <i className="fa-solid fa-chart-pie empty-donut-icon"></i>
            <span className="empty-title">No Active Holdings</span>
            <span className="empty-desc">Record your first BUY transaction below to build your asset allocation.</span>
          </div>
        )}
      </div>

      {/* Sub-Tab Navigation Bar: Record Trade vs Transaction History */}
      <div className="portfolio-subtab-bar">
        <button
          type="button"
          onClick={() => setActiveSubTab('trade')}
          className={`portfolio-subtab-btn ${activeSubTab === 'trade' ? 'active' : ''}`}
        >
          <i className="fa-solid fa-pen-to-square"></i>
          <span>Record Trade</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('history')}
          className={`portfolio-subtab-btn ${activeSubTab === 'history' ? 'active' : ''}`}
        >
          <i className="fa-solid fa-clock-rotate-left"></i>
          <span>Trade History ({activePortfolio.transactions.length})</span>
        </button>
      </div>

      {activeSubTab === 'trade' ? (
        /* Section 2: Record Transaction Form */
        <div className="analysis-section transaction-section">
          <div className="section-subtitle">
            <span>{editingTxIndex !== null ? 'Edit Transaction' : 'Record Transaction'}</span>
            <span className="tx-target-account">{activePortfolio.name}</span>
          </div>

          {/* Active Editing Notification Banner */}
          {editingTxIndex !== null && (
            <div className="editing-tx-banner">
              <div className="editing-tx-info">
                <i className="fa-solid fa-pen-to-square text-cyan"></i>
                <span>Editing Record #{editingTxIndex + 1} ({selectedTicker || 'Asset'})</span>
              </div>
              <button type="button" onClick={handleCancelEdit} className="btn-cancel-editing" title="Cancel editing">
                <i className="fa-solid fa-xmark"></i> Cancel
              </button>
            </div>
          )}

          {/* Order Type Toggle (BUY / SELL / DIVIDEND) */}
          <div className="tx-type-toggle-group">
            <button
              type="button"
              onClick={() => {
                setTxType('BUY');
                if (editingTxIndex === null) {
                  if (selectedTicker && stocks[selectedTicker]?.price) {
                    setPrice(stocks[selectedTicker].price);
                  } else if (price < 1) {
                    setPrice(150.00);
                  }
                }
              }}
              className={`tx-type-btn buy ${txType === 'BUY' ? 'active' : ''}`}
            >
              <i className="fa-solid fa-arrow-trend-up"></i> BUY
            </button>
            <button
              type="button"
              onClick={() => {
                setTxType('SELL');
                if (editingTxIndex === null) {
                  if (selectedTicker && stocks[selectedTicker]?.price) {
                    setPrice(stocks[selectedTicker].price);
                  } else if (price < 1) {
                    setPrice(150.00);
                  }
                }
              }}
              className={`tx-type-btn sell ${txType === 'SELL' ? 'active' : ''}`}
            >
              <i className="fa-solid fa-arrow-trend-down"></i> SELL
            </button>
            <button
              type="button"
              onClick={() => {
                setTxType('DIVIDEND');
                if (editingTxIndex === null) {
                  if (selectedTicker && activePortfolio.holdings[selectedTicker]?.shares > 0) {
                    setShares(parseFloat(Number(activePortfolio.holdings[selectedTicker].shares).toFixed(4)));
                  }
                  if (price > 20) {
                    setPrice(0.50);
                  }
                }
              }}
              className={`tx-type-btn dividend ${txType === 'DIVIDEND' ? 'active' : ''}`}
            >
              <i className="fa-solid fa-hand-holding-dollar"></i> DIVIDEND
            </button>
          </div>

          {/* Autocomplete Ticker Search */}
          <div className="portfolio-search-box" ref={portfolioSearchRef}>
            <div className="search-input-container">
              <i className="fa-solid fa-magnifying-glass search-icon"></i>
              <input
                type="text"
                placeholder="Search ticker or company (e.g. AAPL, NVDA, TSLA)..."
                value={searchQuery}
                onChange={handleSearchChange}
                onFocus={() => setShowDropdown(true)}
                onKeyDown={handleSearchKeyDown}
                autoComplete="off"
                className="portfolio-search-input"
              />
              {isSearchingServer && (
                <i className="fa-solid fa-spinner fa-spin text-cyan search-loading-spinner"></i>
              )}
              {searchQuery.length > 0 && !isSearchingServer && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedTicker(null);
                    setShowDropdown(false);
                  }}
                  className="clear-btn"
                  style={{ display: 'block' }}
                  aria-label="Clear search"
                >
                  <i className="fa-solid fa-xmark"></i>
                </button>
              )}
            </div>

            {/* Autocomplete Dropdown */}
            {showDropdown && searchQuery.trim().length > 0 && (
              <div id="portfolioSearchDropdown" className="portfolio-search-dropdown" style={{ display: 'block' }}>
                {isSearchingServer && searchResults.length === 0 && (
                  <div className="autocomplete-loading">
                    <i className="fa-solid fa-spinner fa-spin text-cyan"></i>
                    <span>Searching markets...</span>
                  </div>
                )}

                {searchResults.slice(0, 8).map((stock, idx) => {
                  const isSelected = idx === activeSuggestionIndex;
                  const sym = stock.ticker || stock.symbol;
                  return (
                    <div
                      key={`${sym}-${idx}`}
                      onClick={() => handleSelectStock(stock)}
                      onMouseEnter={() => setActiveSuggestionIndex(idx)}
                      className={`portfolio-search-item ${isSelected ? 'active' : ''}`}
                    >
                      <div className="item-meta">
                        <div className="ticker-row">
                          <span className="ticker">{sym}</span>
                          {stock.exchange && <span className="autocomplete-tag exchange">{stock.exchange}</span>}
                          {stock.type && <span className={`autocomplete-tag type ${String(stock.type).toLowerCase()}`}>{stock.type}</span>}
                        </div>
                        <span className="name">{stock.name || `${sym} Stock`}</span>
                      </div>
                      {stock.price > 0 && (
                        <span className="price tabular-nums">{formatMoney(stock.price, detectTickerCurrency(sym))}</span>
                      )}
                    </div>
                  );
                })}

                {/* Custom Add Symbol Row */}
                <div
                  onClick={handleAddCustomSymbol}
                  onMouseEnter={() => setActiveSuggestionIndex(searchResults.length)}
                  className={`portfolio-search-item custom-add ${activeSuggestionIndex === searchResults.length ? 'active' : ''}`}
                >
                  <div className="item-meta">
                    <span className="ticker custom-text">
                      <i className="fa-solid fa-circle-plus text-cyan"></i> {searchResults.some(s => (s.ticker || s.symbol) === searchQuery.toUpperCase().trim()) ? 'Select' : `ADD '${searchQuery.toUpperCase().trim()}'`}
                    </span>
                    <span className="name">Fetch live quote and log trade</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Selected Stock Preview Info Card */}
          {selectedTicker && (
            <div id="portfolioStockPreview" className="portfolio-stock-preview">
              <div className="preview-left">
                <span className="preview-ticker-badge">{selectedTicker}</span>
                <span className="preview-name">{stocks[selectedTicker]?.name || `${selectedTicker} Stock`}</span>
              </div>
              <div className="preview-right">
                <span className="preview-price tabular-nums">
                  {formatMoney(stocks[selectedTicker]?.price || price || 0, selectedCurr)}
                </span>
                {activePortfolio.holdings[selectedTicker]?.shares > 0 && (
                  <span className="preview-owned tabular-nums">
                    Owned: {parseFloat(activePortfolio.holdings[selectedTicker].shares.toFixed(4))} sh
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Transaction Inputs Grid */}
          <div className="tx-fields-grid">
            <div className="tx-field">
              <label htmlFor="txShares">{txType === 'DIVIDEND' ? 'Holding Shares (at Payout)' : 'Shares Quantity'}</label>
              <div className="field-input-wrapper">
                <input
                  id="txShares"
                  type="number"
                  value={shares}
                  onChange={(e) => setShares(e.target.value)}
                  min="0.0001"
                  step="any"
                  placeholder="10"
                  className="tabular-nums"
                />
                <span className="field-suffix">SH</span>
              </div>
            </div>

            <div className="tx-field">
              <label htmlFor="txPrice">{txType === 'DIVIDEND' ? 'Dividend Payout Per Share' : 'Execution Price'}</label>
              <div className="field-input-wrapper">
                <span className="field-prefix">{getCurrencySymbol(selectedCurr)}</span>
                <input
                  id="txPrice"
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  min="0"
                  step="any"
                  placeholder={txType === 'DIVIDEND' ? "0.50" : "150.00"}
                  className="tabular-nums"
                />
              </div>
            </div>

            <div className="tx-field">
              <label htmlFor="txDate">Transaction Date</label>
              <input
                id="txDate"
                type="date"
                value={txDate}
                onChange={(e) => setTxDate(e.target.value)}
                className="tabular-nums"
              />
            </div>

            <div className="tx-field">
              <label htmlFor="txFees">{txType === 'DIVIDEND' ? 'Withholding Tax / Fee' : 'Brokerage Fees'}</label>
              <div className="field-input-wrapper">
                <span className="field-prefix">{getCurrencySymbol(selectedCurr)}</span>
                <input
                  id="txFees"
                  type="number"
                  value={fees}
                  onChange={(e) => setFees(e.target.value)}
                  min="0"
                  step="any"
                  placeholder="0.00"
                  className="tabular-nums"
                />
              </div>
            </div>
          </div>

          {/* Investment Account Label */}
          <div className="tx-field account-field">
            <label htmlFor="txAccount">Investment Account</label>
            <input
              id="txAccount"
              type="text"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="e.g. Primary Taxable, Roth IRA"
            />
          </div>

          {/* Live Calculation Estimation Banner */}
          <div className="tx-estimate-banner">
            <div className="estimate-row">
              <span className="estimate-label">{txType === 'DIVIDEND' ? 'Gross Dividend:' : 'Gross Value:'}</span>
              <span className="estimate-val tabular-nums">{formatMoney(gross, selectedCurr)}</span>
            </div>
            <div className="estimate-row total-row">
              <span className="estimate-label">{txType === 'DIVIDEND' ? 'Net Dividend Income:' : 'Net Settlement Total:'}</span>
              <span className={`estimate-val total-val tabular-nums ${txType.toLowerCase()}`}>
                {txType === 'DIVIDEND' ? '+' : ''}{formatMoney(net, selectedCurr)}
              </span>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="button"
            onClick={handleRecordTransaction}
            id="btnRecordTx"
            className={`btn-record-tx ${txType.toLowerCase()} ${editingTxIndex !== null ? 'editing' : ''}`}
          >
            <i className={`fa-solid ${editingTxIndex !== null ? 'fa-floppy-disk' : txType === 'BUY' ? 'fa-circle-plus' : txType === 'SELL' ? 'fa-circle-minus' : 'fa-hand-holding-dollar'}`}></i>
            <span>
              {editingTxIndex !== null
                ? 'Save Changes'
                : txType === 'BUY'
                ? 'Record Buy Order'
                : txType === 'SELL'
                ? 'Record Sell Order'
                : 'Record Dividend Payout'}
            </span>
          </button>
        </div>
      ) : (
        /* Section 2 (Tab 2): Transaction Audit History List in Sidebar */
        <div className="analysis-section sidebar-ledger-section">
          <div className="section-subtitle">
            <span>Transaction Audit History</span>
            <span className="ledger-count-tag tabular-nums">
              {(activePortfolio?.transactions || []).length === 0
                ? '0 Records'
                : filteredTransactions.length === (activePortfolio?.transactions || []).length
                ? `${(activePortfolio?.transactions || []).length} Records`
                : `Showing ${filteredTransactions.length} of ${(activePortfolio?.transactions || []).length}`}
            </span>
          </div>

          {/* Filter Toolbar (Type Pills + Search Box) */}
          <div className="ledger-filter-toolbar">
            <div className="ledger-filter-pill-group">
              {['ALL', 'BUY', 'SELL', 'DIVIDEND'].map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setLedgerTypeFilter(type)}
                  className={`ledger-filter-pill ${type.toLowerCase()} ${ledgerTypeFilter === type ? 'active' : ''}`}
                >
                  {type}
                </button>
              ))}
            </div>

            <div className="ledger-search-box">
              <i className="fa-solid fa-magnifying-glass search-icon"></i>
              <input
                type="text"
                placeholder="Filter symbol/account..."
                value={ledgerSearchQuery}
                onChange={(e) => setLedgerSearchQuery(e.target.value)}
                className="ledger-search-input"
              />
              {ledgerSearchQuery && (
                <button
                  type="button"
                  onClick={() => setLedgerSearchQuery('')}
                  className="ledger-search-clear-btn"
                  title="Clear filter"
                  aria-label="Clear filter"
                >
                  <i className="fa-solid fa-xmark"></i>
                </button>
              )}
            </div>
          </div>

          <div className="sidebar-ledger-viewport">
            <ul className="ledger-list" id="portfolioSidebarLogList">
              {(activePortfolio?.transactions || []).length === 0 ? (
                <li className="empty-pill-msg" style={{ textAlign: 'center', paddingTop: '20px' }}>
                  No transaction audit records found.
                </li>
              ) : filteredTransactions.length === 0 ? (
                <li className="empty-pill-msg filter-empty" style={{ textAlign: 'center', paddingTop: '20px' }}>
                  <p>No transactions match your filter criteria.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setLedgerTypeFilter('ALL');
                      setLedgerSearchQuery('');
                    }}
                    className="btn-clear-filter"
                  >
                    <i className="fa-solid fa-rotate-left"></i> Reset Filters
                  </button>
                </li>
              ) : (
                [...filteredTransactions].reverse().map(({ tx, originalIndex }) => {
                  const txCurr = detectTickerCurrency(tx.ticker);
                  const sharesNum = parseFloat(tx.shares) || 0;
                  const priceNum = parseFloat(tx.price) || 0;
                  const grossVal = sharesNum * priceNum;
                  const txFees = parseFloat(tx.fees) || 0;
                  const netVal = tx.type === 'BUY' ? (grossVal + txFees) : Math.max(0, grossVal - txFees);
                  const accountStr = tx.account && tx.account !== 'Default' ? ` • ${tx.account}` : '';
                  const rowKey = tx.id || `tx-side-log-${originalIndex}`;
                  const txTime = typeof tx.timestamp === 'number' ? tx.timestamp : new Date(tx.date || tx.timestamp || 0).getTime();
                  const txDateStr = !isNaN(txTime) ? new Date(txTime).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent';

                  return (
                    <li key={rowKey} className={`tx-ledger-item ${String(tx.type || 'BUY').toLowerCase()}`}>
                      <div className="ledger-left">
                        <div className="ledger-top-row">
                          <span className={`type-badge ${String(tx.type || 'BUY').toLowerCase()}`}>
                            {tx.type || 'BUY'}
                          </span>
                          <span className="ledger-shares-ticker tabular-nums">
                            <strong>{parseFloat(sharesNum.toFixed(6))} {tx.ticker}</strong> @ {formatMoney(priceNum, txCurr)}
                          </span>
                        </div>
                        <div className="ledger-meta-row tabular-nums">
                          <span>Gross: {formatMoney(grossVal, txCurr)}</span>
                          <span>{tx.type === 'DIVIDEND' ? 'Tax/Fee' : 'Fee'}: {formatMoney(txFees, txCurr)}</span>
                          <span>Net: <strong className={tx.type === 'DIVIDEND' ? 'text-purple' : tx.type === 'BUY' ? 'text-green' : 'text-red'}>{tx.type === 'DIVIDEND' ? '+' : ''}{formatMoney(netVal, txCurr)}</strong></span>
                          {accountStr && <span className="account-tag">{accountStr}</span>}
                        </div>
                      </div>
                      <div className="ledger-right">
                        <span className="tx-time tabular-nums">{txDateStr}</span>
                        <div className="ledger-actions-group">
                          {onEditTransaction && (
                            <button
                              type="button"
                              onClick={() => handleStartEdit(originalIndex, tx)}
                              className="btn-tx-edit"
                              title="Edit transaction entry"
                              aria-label="Edit transaction entry"
                            >
                              <i className="fa-solid fa-pen-to-square"></i>
                            </button>
                          )}
                          {onDeleteTransaction && (
                            <button
                              type="button"
                              onClick={() => {
                                const confirmDelete = confirm("Do you want to delete this transaction entry? This will revert its effect on your holdings.");
                                if (confirmDelete) onDeleteTransaction(activePortfolio.id, originalIndex);
                              }}
                              className="btn-tx-delete"
                              title="Delete transaction entry"
                              aria-label="Delete transaction entry"
                            >
                              <i className="fa-solid fa-trash-can"></i>
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
