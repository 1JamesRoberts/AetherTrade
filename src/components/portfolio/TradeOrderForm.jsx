import { SegmentedControl, ComponentHeading, AssetMark } from '../ui/Controls.jsx';
import { dividendGross } from '../../utils/portfolioLedger.js';
import { localDateString, parseTransactionDate } from '../../utils/dateUtils.js';
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
  onPrefillComplete,
  onAddTransaction,
  onEditTransaction,
  onCancelEdit,
  showNotification,
  onFetchPrice
}) {
  // The parent remounts the form when its portfolio or edited transaction changes.
  const [searchQuery, setSearchQuery] = useState(editingTx?.ticker || '');
  const [selectedTicker, setSelectedTicker] = useState(editingTx?.ticker || null);
  const [txType, setTxType] = useState(editingTx?.type || 'BUY'); // 'BUY' | 'SELL' | 'DIVIDEND'
  const [shares, setShares] = useState(Number(editingTx?.shares ?? 10));
  // For DIVIDEND mode: total gross amount, including per-share imported dividends.
  const [dividendTotal, setDividendTotal] = useState(editingTx?.type === 'DIVIDEND' ? dividendGross(editingTx) : 0);
  const [price, setPrice] = useState(Number(editingTx?.price ?? 185.50));
  const [txDate, setTxDate] = useState(() => localDateString(editingTx?.timestamp));
  const [fees, setFees] = useState(Number(editingTx?.fees || 0));
  const [accountName, setAccountName] = useState(editingTx?.account || activePortfolio?.name || 'Primary Portfolio');
  const [isSaving, setIsSaving] = useState(false);

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

  // Initial inputs come from the keyed transaction snapshot, without cascading effects.

  // Pre-fill a reviewable order from Holdings or Rebalance Studio.
  useEffect(() => {
    if (!prefilledTrade || editingTx || editingTxIndex !== null ||
      (prefilledTrade.portfolioId !== undefined && prefilledTrade.portfolioId !== activePortfolio.id)) return;
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      if (prefilledTrade.ticker) {
        setSelectedTicker(prefilledTrade.ticker);
        setSearchQuery(prefilledTrade.ticker);
      }
      if (prefilledTrade.type) setTxType(prefilledTrade.type);
      if (prefilledTrade.shares) setShares(Number(prefilledTrade.shares));
      if (prefilledTrade.price) setPrice(parseFloat(Number(prefilledTrade.price).toFixed(2)));
      if (prefilledTrade.account) setAccountName(prefilledTrade.account);
    });
    return () => { active = false; };
  }, [prefilledTrade, editingTx, editingTxIndex, activePortfolio.id]);

  // Sync live market price on ticker change (only when NOT editing and not DIVIDEND)
  useEffect(() => {
    let active = true;
    // A prefilled order is a reviewable draft; incoming quotes must not overwrite its execution price.
    const hasPrefilledPrice = prefilledTrade?.ticker === selectedTicker && Number(prefilledTrade.price) > 0;
    if (editingTxIndex === null && !hasPrefilledPrice && selectedTicker && stocks?.[selectedTicker]?.price && txType !== 'DIVIDEND') {
      Promise.resolve().then(() => {
        if (active && editingTxIndex === null) setPrice(stocks[selectedTicker].price);
      });
    }
    return () => { active = false; };
  }, [selectedTicker, stocks, txType, editingTxIndex, prefilledTrade]);

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

  // Record or Update transaction submit; keep the form intact if validation or saving fails.
  const handleRecordTransaction = async () => {
    if (isSaving) return;
    if (!selectedTicker) { alert('Please select a stock asset first.'); return; }
    const stockData = stocks?.[selectedTicker];
    if (!editingTx && txType !== 'DIVIDEND' && (!stockData || !stockData.price || stockData.price <= 0)) {
      showNotification?.(`"${selectedTicker}" does not exist or has no valid price data. Please check the symbol.`, 'error');
      return;
    }
    const txFees = fees === '' ? 0 : cleanFloat(fees);
    const sharesQty = txType === 'DIVIDEND' ? 1 : cleanFloat(shares);
    const pricePerShare = txType === 'DIVIDEND' ? cleanFloat(dividendTotal) : cleanFloat(price);
    if (!Number.isFinite(sharesQty) || sharesQty <= 0) { alert('Please enter a valid quantity of shares.'); return; }
    if (!Number.isFinite(pricePerShare) || (txType === 'DIVIDEND' ? pricePerShare < 0 : pricePerShare <= 0)) {
      alert('Please enter a valid price or dividend amount.'); return;
    }
    if (!Number.isFinite(txFees) || txFees < 0) { alert('Please enter a valid non-negative fee/tax amount.'); return; }
    try {
      const selectedDate = parseTransactionDate(txDate);
      // Preserve execution time and same-day order when editing only amounts/fees.
      const timestamp = editingTx && txDate === localDateString(editingTx.timestamp)
        ? editingTx.timestamp : selectedDate.getTime();
      // DIVIDEND direct entry uses shares=1, price=totalDividend.
      const finalTxData = { timestamp, ticker: selectedTicker, type: txType,
        shares: sharesQty, price: pricePerShare, fees: txFees, account: accountName.trim() || activePortfolio.name };
      setIsSaving(true);
      // The portfolio hook validates the entire chronological ledger for all mutations.
      const saved = editingTxIndex !== null
        ? await onEditTransaction(activePortfolio.id, editingTxIndex, finalTxData)
        : await onAddTransaction(activePortfolio.id, finalTxData);
      if (!saved) return;
      if (editingTxIndex !== null) { onCancelEdit?.(); return; }
      onPrefillComplete?.();
      setShares(10);
      setDividendTotal(0);
      setFees(0);
      setSearchQuery('');
      setSelectedTicker(null);
    } catch (error) {
      showNotification?.(error.message, 'error');
    } finally { setIsSaving(false); }
  };

  // Estimated total calculation
  const selectedCurr = detectTickerCurrency(selectedTicker);
  const qtyVal = cleanFloat(shares) || 0;
  const priceVal = cleanFloat(price) || 0;
  const feeVal = cleanFloat(fees) || 0;
  const divTotalVal = cleanFloat(dividendTotal) || 0;
  const gross = txType === 'DIVIDEND' ? divTotalVal : qtyVal * priceVal;
  const net = txType === 'BUY' ? gross + feeVal : Math.max(0, gross - feeVal);

  return (
    <div className="analysis-section portfolio-form-section transaction-composer">
      <ComponentHeading eyebrow={activePortfolio.name} title={editingTxIndex !== null ? 'Edit transaction' : 'Record a transaction'} description="Keep a record of a purchase, sale, or dividend payment." />
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
      <SegmentedControl label="Transaction type" value={txType} options={[{ value: 'BUY', label: 'Buy', icon: '↗' }, { value: 'SELL', label: 'Sell', icon: '↘' }, { value: 'DIVIDEND', label: 'Dividend', icon: '+' }]} onChange={type => {
        setTxType(type);
        if (editingTxIndex === null) {
          if (type === 'DIVIDEND') setDividendTotal(0.00);
          else if (selectedTicker && stocks?.[selectedTicker]?.price) setPrice(stocks[selectedTicker].price);
          else if (price < 1) setPrice(150.00);
        }
      }} />
      <div className="composer-inputs">
      <label className="ui-field-label" htmlFor="transactionAsset">Asset</label>
      {/* Autocomplete Ticker Search */}
      <div className="portfolio-search-box" ref={portfolioSearchRef}>
        <div className="search-input-container">
          <i className="fa-solid fa-magnifying-glass search-icon"></i>
          <input
            id="transactionAsset"
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
                <button type="button"
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
                </button>
              );
            })}

            {/* Custom Add Symbol Row */}
            <button type="button"
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
            </button>
          </div>
        )}
      </div>

      {/* Selected Stock Preview Info Card */}
      {selectedTicker && (
        <div id="portfolioStockPreview" className="portfolio-stock-preview">
          <div className="preview-left">
            <AssetMark ticker={selectedTicker} /><div className="composer-asset-name"><strong>{selectedTicker}</strong>
            <span className="preview-name">{stocks?.[selectedTicker]?.name || `${selectedTicker} Stock`}</span></div>
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
      <fieldset className="composer-fieldset"><legend>Execution details <span>{selectedCurr}</span></legend><div className="tx-fields-grid">
        {txType !== 'DIVIDEND' && (
          <div className="tx-field">
            <label htmlFor="txShares">Shares Quantity</label>
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
        )}

        {txType === 'DIVIDEND' ? (
          <div className="tx-field">
            <label htmlFor="txDividendTotal">Total Dividend Received</label>
            <div className="field-input-wrapper">
              <span className="field-prefix">{getCurrencySymbol(selectedCurr)}</span>
              <input
                id="txDividendTotal"
                type="number"
                value={dividendTotal}
                onChange={(e) => setDividendTotal(e.target.value)}
                min="0"
                step="any"
                placeholder="0.00"
                className="tabular-nums"
                autoFocus
              />
            </div>
          </div>
        ) : (
          <div className="tx-field">
            <label htmlFor="txPrice">Execution Price</label>
            <div className="field-input-wrapper">
              <span className="field-prefix">{getCurrencySymbol(selectedCurr)}</span>
              <input
                id="txPrice"
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                min="0"
                step="any"
                placeholder="150.00"
                className="tabular-nums"
              />
            </div>
          </div>
        )}

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

      </fieldset>
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

      </div>
      {/* Live Calculation Estimation Banner */}
      <aside className="transaction-receipt" aria-label="Transaction estimate">
        <span className="ui-eyebrow">{editingTxIndex !== null ? 'Updated record' : 'Transaction estimate'}</span>
        <h4>{txType === 'DIVIDEND' ? 'Dividend income' : txType === 'BUY' ? 'Purchase summary' : 'Sale summary'}</h4>
        <dl><div><dt>Asset</dt><dd>{selectedTicker || 'Choose an asset'}</dd></div><div><dt>{txType === 'DIVIDEND' ? 'Gross dividend' : 'Gross value'}</dt><dd className="tabular-nums">{formatMoney(gross, selectedCurr)}</dd></div><div><dt>{txType === 'DIVIDEND' ? 'Tax / fee' : 'Brokerage fees'}</dt><dd className="tabular-nums">{formatMoney(feeVal, selectedCurr)}</dd></div></dl>
        <div className="receipt-total"><span>{txType === 'DIVIDEND' ? 'Net dividend income' : 'Net settlement total'}</span><strong className="tabular-nums">{txType === 'DIVIDEND' ? '+' : ''}{formatMoney(net, selectedCurr)}</strong><small>{selectedCurr} · {accountName || activePortfolio.name}</small></div>
        <p className="receipt-note">{txType === 'BUY' ? 'Includes brokerage fees.' : 'After fees and withholding, where applicable.'}</p>
      </aside>
      {/* Submit Button */}
      <button
        type="button"
        onClick={handleRecordTransaction}
        disabled={isSaving}
        id="btnRecordTx"
        className={`btn-record-tx ${txType.toLowerCase()} ${editingTxIndex !== null ? 'editing' : ''}`}
      >
        <i className={`fa-solid ${editingTxIndex !== null ? 'fa-floppy-disk' : txType === 'BUY' ? 'fa-circle-plus' : txType === 'SELL' ? 'fa-circle-minus' : 'fa-hand-holding-dollar'}`}></i>
        <span>
          {isSaving ? 'Saving…' : editingTxIndex !== null
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
