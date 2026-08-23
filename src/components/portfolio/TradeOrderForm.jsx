import { useState, useEffect, useRef } from 'react';
import {
  detectTickerCurrency,
  getCurrencySymbol,
  formatMoney
} from '../../utils/currencyUtils';

export default function TradeOrderForm({
  activePortfolio,
  stocks,
  editingTxIndex,
  editingTx,
  prefilledTrade,
  onAddTransaction,
  onEditTransaction,
  onCancelEdit,
  showNotification,
  onFetchPrice
}) {
  // Get today's local date YYYY-MM-DD
  const getTodayLocalDate = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Form states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTicker, setSelectedTicker] = useState(null);
  const [txType, setTxType] = useState('BUY'); // 'BUY' | 'SELL' | 'DIVIDEND'
  const [shares, setShares] = useState(10);
  const [price, setPrice] = useState(185.50);
  const [txDate, setTxDate] = useState(getTodayLocalDate);
  const [fees, setFees] = useState(0.00);
  const [accountName, setAccountName] = useState(activePortfolio?.name || 'Primary Portfolio');

  // Search filter autocomplete
  const [searchResults, setSearchResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSearchingServer, setIsSearchingServer] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);

  const portfolioSearchRef = useRef(null);
  const stocksRef = useRef(stocks);

  // Keep stocksRef current without restarting search debounce
  useEffect(() => {
    stocksRef.current = stocks;
  });

  // Sync accountName when active portfolio changes
  useEffect(() => {
    if (activePortfolio?.name && editingTxIndex === null) {
      setAccountName(activePortfolio.name);
    }
  }, [activePortfolio?.name, editingTxIndex]);

  // Sync form inputs when editingTx changes
  useEffect(() => {
    if (editingTxIndex !== null && editingTx) {
      setSelectedTicker(editingTx.ticker);
      setSearchQuery(editingTx.ticker);
      setTxType(editingTx.type || 'BUY');
      setShares(parseFloat(Number(editingTx.shares || 0).toFixed(6)));
      setPrice(parseFloat(Number(editingTx.price !== undefined ? editingTx.price : 0).toFixed(4)));
      setFees(editingTx.fees !== undefined ? parseFloat(editingTx.fees) || 0 : 0);
      if (editingTx.account) setAccountName(editingTx.account);
      if (editingTx.timestamp) {
        const d = new Date(editingTx.timestamp);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        setTxDate(`${year}-${month}-${day}`);
      }
    }
  }, [editingTxIndex, editingTx]);

  // Pre-fill form when user clicks "Fill in Form" from Rebalance Studio
  useEffect(() => {
    if (!prefilledTrade) return;
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
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

  // Sync live market price on ticker change (only when NOT editing and not DIVIDEND)
  useEffect(() => {
    let active = true;
    if (editingTxIndex === null && selectedTicker && stocks?.[selectedTicker]?.price && txType !== 'DIVIDEND') {
      Promise.resolve().then(() => {
        if (active && editingTxIndex === null) setPrice(stocks[selectedTicker].price);
      });
    }
    return () => { active = false; };
  }, [selectedTicker, stocks, txType, editingTxIndex]);

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

  // Search input change handler with prefix/exact ranking
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

  // Debounced server search fallback
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) return;

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
    const livePrice = stock.price || stocks?.[sym]?.price;
    if (livePrice && txType !== 'DIVIDEND') {
      setPrice(livePrice);
    }
    if (txType === 'DIVIDEND') {
      const owned = activePortfolio?.holdings?.[sym]?.shares;
      if (owned && owned > 0) {
        setShares(parseFloat(Number(owned).toFixed(4)));
      }
    }
    if (onFetchPrice) {
      const fetched = await onFetchPrice(sym);
      if (!fetched && !livePrice) {
        showNotification?.(`Fetching price data for "${sym}"...`, 'info');
      }
    }
  };

  const handleAddCustomSymbol = async () => {
    const customTicker = searchQuery.toUpperCase().trim();
    if (customTicker) {
      setSelectedTicker(customTicker);
      setSearchQuery(customTicker);
      setShowDropdown(false);
      const existing = stocks?.[customTicker];
      const livePrice = existing?.price;
      if (livePrice && txType !== 'DIVIDEND') {
        setPrice(livePrice);
      }
      if (txType === 'DIVIDEND') {
        const owned = activePortfolio?.holdings?.[customTicker]?.shares;
        if (owned && owned > 0) {
          setShares(parseFloat(Number(owned).toFixed(4)));
        }
      }
      if (onFetchPrice) {
        const fetched = await onFetchPrice(customTicker);
        if (!fetched && !livePrice) {
          showNotification?.(`Fetching price data for "${customTicker}"...`, 'info');
        }
      }
    }
  };

  // Keyboard navigation for search dropdown
  const handleSearchKeyDown = (e) => {
    if (!showDropdown || searchResults.length === 0) return;
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

  const cleanFloat = (val) => {
    return parseFloat(String(val).replace(/,/g, '').trim());
  };

  // Record or Update transaction submit
  const handleRecordTransaction = () => {
    if (!selectedTicker) {
      alert("Please select a stock asset first.");
      return;
    }

    const stockData = stocks?.[selectedTicker];
    if (txType !== 'DIVIDEND' && (!stockData || !stockData.price || stockData.price <= 0)) {
      showNotification?.(`"${selectedTicker}" does not exist or has no valid price data. Please check the symbol.`, 'error');
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
      const holding = activePortfolio?.holdings?.[selectedTicker];
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
      onCancelEdit?.();
    } else if (onAddTransaction) {
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
  const net = txType === 'BUY' ? gross + feeVal : Math.max(0, gross - feeVal);

  return (
    <div className="analysis-section portfolio-form-section">
      <div className="section-subtitle">
        <span>{editingTxIndex !== null ? 'Edit Transaction Record' : 'Record New Transaction'}</span>
      </div>

      {/* Editing State Banner Notification */}
      {editingTxIndex !== null && (
        <div className="editing-tx-banner">
          <div className="editing-tx-info">
            <i className="fa-solid fa-pen-to-square"></i>
            <span>Editing transaction <strong>#{editingTxIndex + 1}</strong> ({selectedTicker})</span>
          </div>
          <button
            type="button"
            onClick={onCancelEdit}
            className="btn-cancel-editing"
            title="Cancel transaction editing"
          >
            <i className="fa-solid fa-xmark"></i> Cancel Edit
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
              if (selectedTicker && stocks?.[selectedTicker]?.price) {
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
              if (selectedTicker && stocks?.[selectedTicker]?.price) {
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
              if (selectedTicker && activePortfolio?.holdings?.[selectedTicker]?.shares > 0) {
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
            <span className="preview-name">{stocks?.[selectedTicker]?.name || `${selectedTicker} Stock`}</span>
          </div>
          <div className="preview-right">
            <span className="preview-price tabular-nums">
              {formatMoney(stocks?.[selectedTicker]?.price || price || 0, selectedCurr)}
            </span>
            {activePortfolio?.holdings?.[selectedTicker]?.shares > 0 && (
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
              min="0.000001"
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
  );
}
