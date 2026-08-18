import { useState, useEffect, useRef, useMemo } from 'react';
import { Chart, registerables } from 'chart.js';
import RebalanceStudio from './RebalanceStudio';

Chart.register(...registerables);

const ALLOCATION_COLORS = [
  '#06B6D4', // Cyan
  '#8B5CF6', // Purple/Indigo
  '#10B981', // Emerald
  '#F43F5E', // Coral
  '#F59E0B', // Amber
  '#EC4899', // Pink
  '#3B82F6', // Blue
  '#14B8A6', // Teal
];

export default function PortfolioManager({
  portfolios,
  activePortfolioId,
  setActivePortfolioId,
  stocks,
  onAddTransaction,
  onCreatePortfolio,
  onRenamePortfolio,
  onDeletePortfolio,
  onUpdateTargetAllocations,
  onExecuteRebalance,
  showNotification,
  onFetchPrice
}) {
  const allocationCanvasRef = useRef(null);
  const allocationChartRef = useRef(null);

  // Sub-tab selection ('trade' | 'rebalance')
  const [activeSubTab, setActiveSubTab] = useState('trade');

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

  // Sync accountName input when active portfolio changes
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) setAccountName(activePortfolio.name);
    });
    return () => { active = false; };
  }, [activePortfolioId, activePortfolio.name]);

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
    const localMatches = Object.values(currentStocks).filter(stock =>
      (stock.ticker && stock.ticker.toLowerCase().includes(trimmed.toLowerCase())) ||
      (stock.name && stock.name.toLowerCase().includes(trimmed.toLowerCase()))
    ).map(s => ({
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
    if (livePrice) {
      setPrice(livePrice);
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
      if (livePrice) {
        setPrice(livePrice);
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
    if (selectedTicker && stocks[selectedTicker]?.price) {
      Promise.resolve().then(() => {
        if (active) setPrice(stocks[selectedTicker].price);
      });
    }
    return () => { active = false; };
  }, [selectedTicker, stocks]);

  // Transaction fields inputs conversions
  const cleanFloat = (val) => {
    return parseFloat(String(val).replace(/,/g, '').trim());
  };

  // Record transaction submit
  const handleRecordTransaction = () => {
    if (!selectedTicker) {
      alert("Please select a stock asset first.");
      return;
    }

    const stockData = stocks[selectedTicker];
    if (!stockData || !stockData.price || stockData.price <= 0) {
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
    if (isNaN(pricePerShare) || pricePerShare <= 0) {
      alert("Please enter a valid price per share.");
      return;
    }
    if (isNaN(txFees) || txFees < 0) {
      alert("Please enter a valid non-negative trading fee.");
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

    if (txType === 'SELL') {
      const holding = activePortfolio.holdings[selectedTicker];
      if (!holding || holding.shares + 1e-9 < sharesQty) {
        alert(`Insufficient shares. You are attempting to sell ${sharesQty} shares of ${selectedTicker}, but you only own ${holding ? holding.shares : 0} shares.`);
        return;
      }
    }

    const timestamp = txDate ? new Date(txDate + 'T00:00:00').getTime() : Date.now();
    const newTx = {
      timestamp: timestamp,
      ticker: selectedTicker,
      type: txType,
      shares: sharesQty,
      price: pricePerShare,
      fees: txFees,
      account: accountName.trim() || 'Default'
    };

    onAddTransaction(activePortfolio.id, newTx);

    // Reset inputs
    setShares(10);
    setFees(0.00);
    setSearchQuery('');
    setSelectedTicker(null);
  };

  // Estimated total calculation
  const qtyVal = cleanFloat(shares) || 0;
  const priceVal = cleanFloat(price) || 0;
  const feeVal = cleanFloat(fees) || 0;
  const gross = qtyVal * priceVal;
  const net = txType === 'BUY' ? (gross + feeVal) : Math.max(0, gross - feeVal);

  const { holdingsList, totalAssetValue } = useMemo(() => {
    let total = 0;
    const keys = Object.keys(activePortfolio.holdings || {});
    const list = keys
      .filter(t => (activePortfolio.holdings[t]?.shares || 0) > 0)
      .map(ticker => {
        const holding = activePortfolio.holdings[ticker];
        const stockMeta = stocks[ticker] || { price: holding.avgCost, name: `${ticker} Stock` };
        const stockPrice = stockMeta.price || holding.avgCost;
        const marketValue = holding.shares * stockPrice;
        total += marketValue;
        return {
          ticker,
          name: stockMeta.name || `${ticker} Stock`,
          shares: holding.shares,
          price: stockPrice,
          marketValue
        };
      })
      .sort((a, b) => b.marketValue - a.marketValue);
    return { holdingsList: list, totalAssetValue: total };
  }, [activePortfolio.holdings, stocks]);

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
          data: holdingsList.map(h => parseFloat(h.marketValue.toFixed(2))),
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
                const pct = (val / totalAssetValue) * 100;
                return ` ${context.label}: $${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${pct.toFixed(1)}%)`;
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
  }, [holdingsList, totalAssetValue]);

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
      {/* Portfolio Header with Account Switcher */}
      <div className="panel-header portfolio-header-bar">
        <h2 className="panel-title">
          <i className="fa-solid fa-briefcase"></i> Portfolio Manager
        </h2>
        <div className="portfolio-actions-cluster">
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
                  ${totalAssetValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="donut-center-sub">{holdingsList.length} Active Holdings</span>
              </div>
            </div>

            {/* Allocation Legend List */}
            <div className="allocation-legend-list">
              {holdingsList.map((item, idx) => {
                const weight = totalAssetValue > 0 ? (item.marketValue / totalAssetValue) * 100 : 0;
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
                        ${item.marketValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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

      {/* Sub-Tab Navigation Bar: Record Trade vs Target Strategy & Rebalance */}
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
          onClick={() => setActiveSubTab('rebalance')}
          className={`portfolio-subtab-btn ${activeSubTab === 'rebalance' ? 'active' : ''}`}
        >
          <i className="fa-solid fa-bullseye"></i>
          <span>Strategy & Rebalance</span>
        </button>
      </div>

      {activeSubTab === 'trade' ? (
        /* Section 2: Record Transaction Form */
        <div className="analysis-section transaction-section">
          <div className="section-subtitle">
            <span>Record Transaction</span>
            <span className="tx-target-account">{activePortfolio.name}</span>
          </div>

          {/* Order Type Toggle (BUY / SELL) */}
          <div className="tx-type-toggle-group">
            <button
              type="button"
              onClick={() => setTxType('BUY')}
              className={`tx-type-btn buy ${txType === 'BUY' ? 'active' : ''}`}
            >
              <i className="fa-solid fa-arrow-trend-up"></i> BUY
            </button>
            <button
              type="button"
              onClick={() => setTxType('SELL')}
              className={`tx-type-btn sell ${txType === 'SELL' ? 'active' : ''}`}
            >
              <i className="fa-solid fa-arrow-trend-down"></i> SELL
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
                        <span className="price tabular-nums">${stock.price.toFixed(2)}</span>
                      )}
                    </div>
                  );
                })}

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
                  ${(stocks[selectedTicker]?.price || price || 0).toFixed(2)}
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
              <label htmlFor="txShares">Shares Quantity</label>
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
              <label htmlFor="txPrice">Execution Price</label>
              <div className="field-input-wrapper">
                <span className="field-prefix">$</span>
                <input
                  id="txPrice"
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  min="0.01"
                  step="0.01"
                  placeholder="150.00"
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
              <label htmlFor="txFees">Brokerage Fees</label>
              <div className="field-input-wrapper">
                <span className="field-prefix">$</span>
                <input
                  id="txFees"
                  type="number"
                  value={fees}
                  onChange={(e) => setFees(e.target.value)}
                  min="0"
                  step="0.01"
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
              <span className="estimate-label">Gross Value:</span>
              <span className="estimate-val tabular-nums">${gross.toFixed(2)}</span>
            </div>
            <div className="estimate-row total-row">
              <span className="estimate-label">Net Settlement Total:</span>
              <span className={`estimate-val total-val tabular-nums ${txType === 'BUY' ? 'buy' : 'sell'}`}>
                ${net.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="button"
            onClick={handleRecordTransaction}
            id="btnRecordTx"
            className={`btn-record-tx ${txType === 'BUY' ? 'buy' : 'sell'}`}
          >
            <i className={`fa-solid ${txType === 'BUY' ? 'fa-circle-plus' : 'fa-circle-minus'}`}></i>
            <span>Record {txType === 'BUY' ? 'Buy Order' : 'Sell Order'}</span>
          </button>
        </div>
      ) : (
        <RebalanceStudio
          activePortfolio={activePortfolio}
          stocks={stocks}
          onUpdateTargetAllocations={onUpdateTargetAllocations}
          onExecuteRebalance={onExecuteRebalance}
          showNotification={showNotification}
        />
      )}
    </section>
  );
}
