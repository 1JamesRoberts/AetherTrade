import React, { useState, useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

const ALLOCATION_COLORS = [
  '#00f0ff', // Neon cyan
  '#8b5cf6', // Indigo violet
  '#10b981', // Emerald green
  '#f43f5e', // Rose red
  '#f59e0b', // Amber orange
  '#ec4899'  // Neon pink
];

export default function PortfolioManager({
  portfolios,
  setPortfolios,
  activePortfolioId,
  setActivePortfolioId,
  stocks,
  onAddTransaction,
  showNotification
}) {
  const allocationCanvasRef = useRef(null);
  const allocationChartRef = useRef(null);

  // Form states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTicker, setSelectedTicker] = useState(null);
  const [txType, setTxType] = useState('BUY'); // 'BUY' | 'SELL'
  const [shares, setShares] = useState(10);
  const [price, setPrice] = useState(185.50);
  
  // Get today's local date YYYY-MM-DD
  const getTodayDateString = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };
  const [txDate, setTxDate] = useState(getTodayDateString());
  const [fees, setFees] = useState(0.00);

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
    setAccountName(activePortfolio.name);
  }, [activePortfolioId, activePortfolio.name]);

  // Autocomplete suggestions search list state
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchResults, setSearchResults] = useState([]);

  // Handle Portfolio Switch
  const handlePortfolioSelect = (e) => {
    setActivePortfolioId(e.target.value);
    setSelectedTicker(null);
    setSearchQuery('');
    setShowDropdown(false);
  };

  // Create Portfolio
  const handleCreatePortfolio = () => {
    const name = prompt("Enter a unique name for the new portfolio:");
    if (!name || name.trim() === '') return;
    const cleanName = name.trim();

    if (portfolios.some(p => p.name.toLowerCase() === cleanName.toLowerCase())) {
      showNotification(`A portfolio named "${cleanName}" already exists!`, 'error');
      return;
    }

    const newId = 'portfolio_' + Date.now();
    const newPort = {
      id: newId,
      name: cleanName,
      holdings: {},
      transactions: [],
      realizedPL: 0
    };

    setPortfolios([...portfolios, newPort]);
    setActivePortfolioId(newId);
    showNotification(`Created portfolio "${cleanName}" successfully!`, 'success');
  };

  // Rename Portfolio
  const handleRenamePortfolio = () => {
    const name = prompt("Enter a new name for the portfolio:", activePortfolio.name);
    if (!name || name.trim() === '') return;
    const cleanName = name.trim();

    if (activePortfolio.name === cleanName) return;

    if (portfolios.some(p => p.id !== activePortfolioId && p.name.toLowerCase() === cleanName.toLowerCase())) {
      showNotification(`A portfolio named "${cleanName}" already exists!`, 'error');
      return;
    }

    const updated = portfolios.map(p => {
      if (p.id === activePortfolioId) {
        return { ...p, name: cleanName };
      }
      return p;
    });

    setPortfolios(updated);
    showNotification(`Renamed portfolio "${activePortfolio.name}" to "${cleanName}" successfully!`, 'success');
  };

  // Delete Portfolio
  const handleDeletePortfolio = () => {
    if (portfolios.length <= 1) {
      showNotification("You must keep at least one portfolio!", "error");
      return;
    }

    const confirmDelete = confirm(`Are you sure you want to permanently delete the portfolio "${activePortfolio.name}"?\nThis will erase all its holdings and transaction logs.`);
    if (!confirmDelete) return;

    const remaining = portfolios.filter(p => p.id !== activePortfolioId);
    setPortfolios(remaining);
    setActivePortfolioId(remaining[0].id);
    showNotification(`Deleted portfolio "${activePortfolio.name}" successfully.`, "success");
  };

  // Autocomplete filter search
  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearchQuery(val);

    if (val.trim() === '') {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    // Filter stocks from state stocks cache
    const matches = Object.values(stocks).filter(stock =>
      (stock.ticker && stock.ticker.toLowerCase().includes(val.toLowerCase())) ||
      (stock.name && stock.name.toLowerCase().includes(val.toLowerCase()))
    );

    setSearchResults(matches);
    setShowDropdown(true);
  };

  // Select stock from search dropdown autocomplete list
  const handleSelectStock = (stock) => {
    setSelectedTicker(stock.ticker);
    setSearchQuery(stock.ticker);
    setShowDropdown(false);
    setPrice(stock.price || 150.00);
  };

  // Add custom symbol selection support
  const handleAddCustomSymbol = () => {
    const customTicker = searchQuery.toUpperCase().trim();
    if (customTicker) {
      setSelectedTicker(customTicker);
      setSearchQuery(customTicker);
      setShowDropdown(false);
      
      const existing = stocks[customTicker];
      setPrice(existing ? existing.price : 150.00);
    }
  };

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

    // Check future date restriction
    if (txDate) {
      const selectedDate = new Date(txDate + 'T00:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (selectedDate > today) {
        alert("Invalid Transaction Date: Transactions cannot be recorded with a future date.");
        return;
      }
    }

    // Validate SELL sufficiency checks using delta bounds
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

    onAddTransaction(activePortfolioId, newTx);

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

  // Holdings allocations listing
  const holdingsKeys = Object.keys(activePortfolio.holdings || {});
  let totalAssetValue = 0;

  const holdingsList = holdingsKeys.map(ticker => {
    const holding = activePortfolio.holdings[ticker];
    const stockMeta = stocks[ticker] || { price: holding.avgCost };
    const stockPrice = stockMeta.price || holding.avgCost;
    const marketValue = holding.shares * stockPrice;
    totalAssetValue += marketValue;
    return {
      ticker,
      shares: holding.shares,
      price: stockPrice,
      marketValue
    };
  }).sort((a, b) => b.marketValue - a.marketValue);

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
          borderColor: 'rgba(2, 4, 10, 0.85)',
          borderWidth: 2,
          hoverOffset: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#060912',
            titleColor: '#00e5ff',
            bodyColor: '#fff',
            borderColor: 'rgba(255, 255, 255, 0.06)',
            borderWidth: 1,
            titleFont: { family: 'Outfit', weight: '700', size: 12 },
            bodyFont: { family: 'JetBrains Mono', size: 11 },
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
        cutout: '70%'
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
      if (!e.target.closest('.search-box')) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, []);

  return (
    <section className="panel panel-portfolio-left" aria-label="Portfolio Allocations" style={{ height: '100%', overflowY: 'auto' }}>
      <div className="panel-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <h2 className="panel-title" style={{ margin: 0 }}>
          <i className="fa-solid fa-briefcase"></i> Portfolio Manager
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div className="select-wrapper" style={{ position: 'relative' }}>
            <select
              id="portfolioSelector"
              value={activePortfolioId}
              onChange={handlePortfolioSelect}
              style={{
                background: 'rgba(10, 15, 30, 0.6)',
                border: '1px solid var(--border-color)',
                color: '#fff',
                padding: '6px 30px 6px 12px',
                borderRadius: 'var(--radius-md)',
                fontFamily: 'var(--font-body)',
                fontWeight: 600,
                fontSize: '12px',
                outline: 'none',
                transition: 'all var(--transition-fast) ease',
                appearance: 'none',
                cursor: 'pointer',
                minWidth: '140px',
                boxShadow: '0 0 10px rgba(0, 240, 255, 0.05)',
              }}
            >
              {portfolios.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <i className="fa-solid fa-chevron-down" style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', color: 'var(--text-muted)', pointerEvents: 'none' }}></i>
          </div>
          <button onClick={handleCreatePortfolio} id="btnCreatePortfolio" className="btn" title="Create new portfolio" style={{ padding: '6px 10px', fontSize: '11px', margin: 0, display: 'inline-flex', height: 'auto', background: 'rgba(0, 240, 255, 0.1)', border: '1px solid rgba(0, 240, 255, 0.3)', color: 'var(--cyan)', boxShadow: '0 0 8px rgba(0, 240, 255, 0.1)', transition: 'all var(--transition-fast) ease', alignItems: 'center', justifyContent: 'center' }}>
            <i className="fa-solid fa-plus"></i>
          </button>
          <button onClick={handleRenamePortfolio} id="btnRenamePortfolio" className="btn" title="Rename current portfolio" style={{ padding: '6px 10px', fontSize: '11px', margin: 0, display: 'inline-flex', height: 'auto', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', color: '#f59e0b', boxShadow: '0 0 8px rgba(245, 158, 11, 0.1)', transition: 'all var(--transition-fast) ease', alignItems: 'center', justifyContent: 'center' }}>
            <i className="fa-solid fa-pen"></i>
          </button>
          <button onClick={handleDeletePortfolio} id="btnDeletePortfolio" className="btn" title="Delete current portfolio" style={{ padding: '6px 10px', fontSize: '11px', margin: 0, display: 'inline-flex', height: 'auto', background: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244, 63, 94, 0.3)', color: 'var(--red)', boxShadow: '0 0 8px rgba(244, 63, 94, 0.1)', transition: 'all var(--transition-fast) ease', alignItems: 'center', justifyContent: 'center' }}>
            <i className="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </div>

      {/* Record Transaction Section */}
      <div className="analysis-section" style={{ position: 'relative' }}>
        <div className="section-subtitle">Record Transaction</div>

        {/* Autocomplete Ticker Search */}
        <div className="search-box" style={{ padding: 0, marginBottom: '12px', position: 'relative' }}>
          <div className="search-input-container">
            <i className="fa-solid fa-magnifying-glass search-icon"></i>
            <input
              type="text"
              placeholder="Search ticker (e.g. AAPL, NVDA)..."
              value={searchQuery}
              onChange={handleSearchChange}
              autoComplete="off"
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
            {searchQuery.length > 0 && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedTicker(null);
                  setShowDropdown(false);
                }}
                className="clear-btn"
                style={{ display: 'block' }}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            )}
          </div>

          {/* suggestions list */}
          {showDropdown && (
            <div id="portfolioSearchDropdown" className="portfolio-search-dropdown" style={{ display: 'block' }}>
              {searchResults.length === 0 ? (
                <div onClick={handleAddCustomSymbol} className="portfolio-search-item">
                  <div>
                    <span className="ticker"><i className="fa-solid fa-circle-plus"></i> ADD '{searchQuery.toUpperCase()}'</span>
                    <span className="name">Add custom symbol</span>
                  </div>
                </div>
              ) : (
                searchResults.slice(0, 5).map(stock => (
                  <div key={stock.ticker} onClick={() => handleSelectStock(stock)} className="portfolio-search-item">
                    <div>
                      <span className="ticker">{stock.ticker}</span>
                      <span className="name">{stock.name || `${stock.ticker} Stock`}</span>
                    </div>
                    <span className="price">${stock.price.toFixed(2)}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Selected Stock Preview Info Card */}
        {selectedTicker && (
          <div id="portfolioStockPreview" className="portfolio-stock-preview" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)', padding: '10px 14px', borderRadius: 'var(--radius-md)', marginBottom: '14px' }}>
            <div>
              <span id="previewTicker" style={{ fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--cyan)', fontSize: '14px', paddingRight: '6px' }}>{selectedTicker}</span>
              <span id="previewName" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{(stocks[selectedTicker]?.name) || `${selectedTicker} Stock`}</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span id="previewPrice" style={{ fontWeight: 700, color: '#fff', fontSize: '13px' }}>${(stocks[selectedTicker]?.price || price).toFixed(2)}</span>
              <div id="previewChange" style={{ fontSize: '10px', fontWeight: 700 }} className={(stocks[selectedTicker]?.change || 0) >= 0 ? 'text-green' : 'text-red'}>
                {((stocks[selectedTicker]?.change) || 0) >= 0 ? '+' : ''}{((stocks[selectedTicker]?.change) || 0).toFixed(2)}%
              </div>
            </div>
          </div>
        )}

        {/* Transaction Fields Form */}
        <div className="transaction-form" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* BUY/SELL Toggle */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Transaction Type</label>
            <div className="action-toggle-group" style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)', padding: '3px', borderRadius: 'var(--radius-md)', gap: '2px' }}>
              <button onClick={() => setTxType('BUY')} className={`tx-toggle-btn ${txType === 'BUY' ? 'active' : ''}`} data-tx="BUY" style={{ flex: 1 }}>BUY</button>
              <button onClick={() => setTxType('SELL')} className={`tx-toggle-btn ${txType === 'SELL' ? 'active' : ''}`} data-tx="SELL" style={{ flex: 1 }}>SELL</button>
            </div>
          </div>

          {/* Shares & Price inputs */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label htmlFor="txShares" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Shares Quantity</label>
              <input
                type="number"
                id="txShares"
                min="0.000001"
                step="any"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                style={{ background: 'rgba(10, 15, 30, 0.4)', border: '1px solid var(--border-color)', color: '#fff', padding: '8px 12px', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-body)', fontWeight: 600, outline: 'none', width: '100%', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label htmlFor="txPrice" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Price Per Share</label>
              <input
                type="number"
                id="txPrice"
                min="0.01"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                style={{ background: 'rgba(10, 15, 30, 0.4)', border: '1px solid var(--border-color)', color: '#fff', padding: '8px 12px', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-body)', fontWeight: 600, outline: 'none', width: '100%', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* Date Picker */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label htmlFor="txDate" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Transaction Date</label>
            <input
              type="date"
              id="txDate"
              value={txDate}
              onChange={(e) => setTxDate(e.target.value)}
              style={{ background: 'rgba(10, 15, 30, 0.4)', border: '1px solid var(--border-color)', color: '#fff', padding: '8px 12px', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-body)', fontWeight: 600, outline: 'none', width: '100%', boxSizing: 'border-box' }}
            />
          </div>

          {/* Fees & Account */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label htmlFor="txFees" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Trading Fees</label>
              <input
                type="number"
                id="txFees"
                min="0"
                step="0.01"
                value={fees}
                onChange={(e) => setFees(e.target.value)}
                style={{ background: 'rgba(10, 15, 30, 0.4)', border: '1px solid var(--border-color)', color: '#fff', padding: '8px 12px', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-body)', fontWeight: 600, outline: 'none', width: '100%', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label htmlFor="txAccount" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Investment Account</label>
              <input
                type="text"
                id="txAccount"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="e.g. Roth IRA, Taxable"
                style={{ background: 'rgba(10, 15, 30, 0.4)', border: '1px solid var(--border-color)', color: '#fff', padding: '8px 12px', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-body)', fontWeight: 600, outline: 'none', width: '100%', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* Estimated Value Preview */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0, 240, 255, 0.03)', border: '1px dashed rgba(0, 240, 255, 0.2)', padding: '10px 14px', borderRadius: 'var(--radius-md)', marginTop: '4px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Estimated Value</span>
            <span id="txTotalEst" style={{ fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--cyan)', fontSize: '12px', textAlign: 'right' }}>
              ${net.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({txType === 'BUY' ? 'Total Cost' : 'Net Proceeds'}, gross: ${gross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
            </span>
          </div>

          {/* Submit Button */}
          <button
            onClick={handleRecordTransaction}
            id="btnAddTransaction"
            className="btn"
            style={{
              background: txType === 'BUY' ? 'linear-gradient(135deg, var(--cyan), var(--cyan-glow))' : 'linear-gradient(135deg, var(--bearish), var(--bearish-glow))',
              color: txType === 'BUY' ? '#000' : '#fff',
              border: 'none',
              padding: '10px 16px',
              fontWeight: 700,
              fontSize: '13px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              borderRadius: 'var(--radius-md)',
              justifyContent: 'center',
              boxShadow: txType === 'BUY' ? '0 4px 15px rgba(0, 240, 255, 0.2)' : '0 4px 15px var(--bearish-glow)',
              cursor: 'pointer',
              transition: 'all var(--transition-fast)',
              marginTop: '6px'
            }}
          >
            <i className={txType === 'BUY' ? "fa-solid fa-circle-plus" : "fa-solid fa-circle-minus"}></i> Record {txType} Transaction
          </button>
        </div>
      </div>

      {/* Asset Allocation progress bars & pie chart */}
      <div className="analysis-section" style={{ flex: 1.2, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: '550px' }}>
        <div className="section-subtitle">Asset Allocations</div>
        <div style={{ position: 'relative', height: '180px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '4px 0 10px 0' }} id="allocationChartContainer">
          <canvas ref={allocationCanvasRef} id="portfolioAllocationChart" style={{ maxHeight: '170px', maxWidth: '170px', display: holdingsList.length > 0 ? 'block' : 'none' }}></canvas>
          {holdingsList.length === 0 && (
            <div id="allocationEmptyMsg" className="empty-pill-msg" style={{ position: 'absolute', textAlign: 'center', display: 'block' }}>No holdings active yet.</div>
          )}
        </div>
        <div className="levels-scroller" id="portfolioAllocationContainer" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', paddingRight: '4px', maxHeight: '350px' }}>
          {holdingsList.length === 0 ? (
            <div className="empty-pill-msg" style={{ textAlign: 'center', marginTop: '20px' }}>No holdings active yet. Record a transaction to view allocation distribution.</div>
          ) : (
            holdingsList.map((holding, idx) => {
              const allocationPct = totalAssetValue > 0 ? (holding.marketValue / totalAssetValue) * 100 : 0;
              const barColor = ALLOCATION_COLORS[idx % ALLOCATION_COLORS.length];
              return (
                <div key={holding.ticker} className="allocation-bar-wrapper">
                  <div className="allocation-bar-header">
                    <span className="allocation-bar-ticker">{holding.ticker}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {parseFloat(holding.shares.toFixed(6))} shares @ ${holding.price.toFixed(2)}
                    </span>
                    <span className="allocation-bar-pct" style={{ color: barColor }}>{allocationPct.toFixed(1)}%</span>
                  </div>
                  <div className="allocation-bar-track">
                    <div className="allocation-bar-fill" style={{ width: `${allocationPct}%`, background: barColor, boxShadow: `0 0 8px ${barColor}` }}></div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
