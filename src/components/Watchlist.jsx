import { useState, useRef, useEffect } from 'react';
import { detectTickerCurrency, formatMoney } from '../utils/currencyUtils';

// Mini SVG Sparkline — renders real 1D intraday close prices when available,
// falling back to a generated bezier shape while data is loading.
function Sparkline({ isUp = true, change = 0, points = null }) {
  const strokeColor = isUp ? 'var(--bullish)' : 'var(--bearish)';
  const fillColor = isUp ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)';
  const width = 50;
  const height = 24;

  // --- Real data path ---
  if (points && points.length > 1) {
    const minP = Math.min(...points);
    const maxP = Math.max(...points);
    const range = maxP - minP || 1; // avoid div-by-zero on flat line
    const step = width / (points.length - 1);

    // Map price to Y (inverted: high price = low Y)
    const normalize = (p) => height - ((p - minP) / range) * (height - 2) - 1;

    const pathPoints = points.map((p, i) => `${(i * step).toFixed(1)},${normalize(p).toFixed(1)}`).join(' ');
    const polylineD = `M ${pathPoints.split(' ').join(' L ')}`;
    const areaD = `${polylineD} L ${width},${height} L 0,${height} Z`;

    return (
      <svg width={width} height={height} className="stock-sparkline" viewBox={`0 0 ${width} ${height}`}>
        <path d={areaD} fill={fillColor} />
        <path d={polylineD} fill="none" stroke={strokeColor} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  // --- Fallback: generated bezier shape based on % change ---
  const absChange = Math.min(Math.abs(change), 10);
  const spread = (absChange / 10) * 8 + 4;

  const pts = isUp
    ? [18, 16 + spread * 0.2, 19, 13, 15 - spread * 0.3, 10, 8, 4]
    : [4, 7, 5, 12 + spread * 0.2, 11, 16, 15 + spread * 0.3, 20];

  const step = width / (pts.length - 1);
  const pathD = pts.reduce((acc, y, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${i * step},${y}`, '');
  const areaD = `${pathD} L ${width},${height} L 0,${height} Z`;

  return (
    <svg width={width} height={height} className="stock-sparkline" viewBox={`0 0 ${width} ${height}`}>
      <path d={areaD} fill={fillColor} />
      <path d={pathD} fill="none" stroke={strokeColor} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}


export default function Watchlist({
  watchlist,
  activeTicker,
  setActiveTicker,
  stocks,
  onRemoveTicker,
  onAddTicker,
  isCollapsed,
  onToggleCollapse
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all'); // 'all', 'gainers', 'losers'
  const [hoveredRailTicker, setHoveredRailTicker] = useState(null);
  const [showRailSearch, setShowRailSearch] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);

  const searchInputRef = useRef(null);
  const railSearchInputRef = useRef(null);
  const searchContainerRef = useRef(null);
  const railSearchContainerRef = useRef(null);

  // Focus mini-rail input when opened
  useEffect(() => {
    if (showRailSearch && railSearchInputRef.current) {
      railSearchInputRef.current.focus();
    }
  }, [showRailSearch]);

  // Click outside to dismiss autocomplete dropdowns
  useEffect(() => {
    function handleClickOutside(e) {
      const inMainSearch = searchContainerRef.current && searchContainerRef.current.contains(e.target);
      const inRailSearch = railSearchContainerRef.current && railSearchContainerRef.current.contains(e.target);
      if (!inMainSearch && !inRailSearch) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleQueryChange = (val) => {
    setQuery(val);
    if (val.trim().length < 2) {
      setSuggestions([]);
      setIsLoadingSuggestions(false);
      setActiveSuggestionIndex(0);
      setShowDropdown(val.trim().length > 0);
    } else {
      setIsLoadingSuggestions(true);
      setShowDropdown(true);
    }
  };

  // Debounced live symbol/company search via proxy with AbortController
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      return;
    }

    const controller = new AbortController();

    const timeoutId = setTimeout(async () => {
      try {
        setIsLoadingSuggestions(true);
        const res = await fetch(`/api/stock/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json.status === 'ok') {
          setSuggestions(json.data || []);
          setActiveSuggestionIndex(0);
          setShowDropdown(true);
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.warn('Autocomplete search failed:', err);
        }
      } finally {
        setIsLoadingSuggestions(false);
      }
    }, 300);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [query]);

  const filteredTickers = watchlist.filter((ticker) => {
    const stock = stocks[ticker] || {};
    const matchesQuery =
      ticker.toLowerCase().includes(query.toLowerCase()) ||
      (stock.name && stock.name.toLowerCase().includes(query.toLowerCase()));

    if (!matchesQuery) return false;
    if (filter === 'gainers') return (stock.change ?? 0) > 0;
    if (filter === 'losers') return (stock.change ?? 0) < 0;
    return true;
  });

  const handleAddCustom = (tickerToAdd) => {
    const cleanQuery = (tickerToAdd || query || '').toUpperCase().trim();
    if (cleanQuery) {
      onAddTicker(cleanQuery);
      setQuery('');
      setShowRailSearch(false);
      setShowDropdown(false);
      setSuggestions([]);
    }
  };

  const handleKeyDown = (e) => {
    const hasCustomOption = query.trim().length > 0;
    const totalItems = suggestions.length + (hasCustomOption ? 1 : 0);

    if (totalItems === 0) {
      if (e.key === 'Escape') {
        setShowDropdown(false);
        setQuery('');
      }
      return;
    }

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
      if (activeSuggestionIndex >= 0 && activeSuggestionIndex < suggestions.length) {
        handleAddCustom(suggestions[activeSuggestionIndex].symbol);
      } else {
        handleAddCustom(query);
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
      setQuery('');
    }
  };

  const handleRailSearchKeyDown = (e) => {
    handleKeyDown(e);
    if (e.key === 'Escape') {
      setShowRailSearch(false);
    }
  };

  // =========================================================================
  // RENDER COMPACT MINI-RAIL (WHEN COLLAPSED)
  // =========================================================================
  if (isCollapsed) {
    return (
      <aside className="panel panel-left collapsed" aria-label="Compact Watchlist Rail">
        <div className="mini-rail-container">
          <div className="mini-rail-header">
            <button
              onClick={onToggleCollapse}
              className="rail-expand-btn"
              title="Expand Watchlist"
              aria-label="Expand Watchlist"
            >
              <i className="fa-solid fa-angles-right"></i>
            </button>
            <button
              onClick={() => {
                setShowRailSearch(!showRailSearch);
                setShowDropdown(true);
              }}
              className={`rail-add-btn ${showRailSearch ? 'active' : ''}`}
              title="Quick Add Ticker"
              aria-label="Quick Add Ticker"
            >
              <i className="fa-solid fa-plus"></i>
            </button>
          </div>

          {/* Quick Search Popover when clicked + in Mini-Rail */}
          {showRailSearch && (
            <div className="rail-search-popover" ref={railSearchContainerRef}>
              <div className="rail-search-header">
                <i className="fa-solid fa-magnifying-glass"></i>
                <input
                  ref={railSearchInputRef}
                  type="text"
                  value={query}
                  onChange={(e) => handleQueryChange(e.target.value)}
                  onFocus={() => setShowDropdown(true)}
                  onKeyDown={handleRailSearchKeyDown}
                  placeholder="Symbol or company..."
                />
                {isLoadingSuggestions && (
                  <i className="fa-solid fa-spinner fa-spin text-cyan rail-search-spinner"></i>
                )}
                <button onClick={() => setShowRailSearch(false)} className="rail-search-close">
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>

              {/* Autocomplete Dropdown in Rail Popover */}
              {showDropdown && (
                <div className="search-autocomplete-dropdown rail-dropdown">
                  {isLoadingSuggestions && suggestions.length === 0 && (
                    <div className="autocomplete-loading">
                      <i className="fa-solid fa-spinner fa-spin text-cyan"></i>
                      <span>Searching...</span>
                    </div>
                  )}

                  {!isLoadingSuggestions && suggestions.length === 0 && query.trim().length >= 2 && (
                    <div className="autocomplete-empty-state">
                      <i className="fa-solid fa-circle-exclamation text-warning"></i>
                      <span>No verified stock found for "{query.trim().toUpperCase()}"</span>
                    </div>
                  )}

                  {suggestions.map((item, idx) => {
                    const isSelected = idx === activeSuggestionIndex;
                    const isAlreadyInWatchlist = watchlist.includes(item.symbol);
                    return (
                      <div
                        key={`${item.symbol}-${item.exchange}-${idx}`}
                        className={`autocomplete-item ${isSelected ? 'active' : ''} ${isAlreadyInWatchlist ? 'in-watchlist' : ''}`}
                        onClick={() => handleAddCustom(item.symbol)}
                        onMouseEnter={() => setActiveSuggestionIndex(idx)}
                      >
                        <div className="autocomplete-left">
                          <span className="autocomplete-symbol">{item.symbol}</span>
                          <span className="autocomplete-name">{item.name}</span>
                        </div>
                        <div className="autocomplete-right">
                          <span className="autocomplete-tag exchange">{item.exchange}</span>
                          <span className={`autocomplete-tag type ${item.type.toLowerCase()}`}>{item.type}</span>
                        </div>
                      </div>
                    );
                  })}

                  {query.trim().length > 0 && (
                    <div
                      className={`autocomplete-item custom-add ${activeSuggestionIndex === suggestions.length ? 'active' : ''}`}
                      onClick={() => handleAddCustom(query)}
                      onMouseEnter={() => setActiveSuggestionIndex(suggestions.length)}
                    >
                      <div className="autocomplete-left">
                        <span className="autocomplete-symbol custom-symbol">
                          <i className="fa-solid fa-circle-plus text-cyan"></i>
                        </span>
                        <span className="autocomplete-name">
                          Add <strong>"{query.toUpperCase().trim()}"</strong>
                        </span>
                      </div>
                      <div className="autocomplete-right">
                        <span className="autocomplete-tag custom">Custom</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Compact Ticker Badge Items */}
          <div className="mini-rail-list">
            {watchlist.map((ticker) => {
              const stock = { ticker, name: `${ticker} Stock`, price: 0, change: 0, ...stocks[ticker] };
              const isUp = (stock.change ?? 0) >= 0;
              const isActive = ticker === activeTicker;

              return (
                <div
                  key={ticker}
                  className="rail-item-wrapper"
                  onMouseEnter={() => setHoveredRailTicker(ticker)}
                  onMouseLeave={() => setHoveredRailTicker(null)}
                >
                  <button
                    onClick={() => setActiveTicker(ticker)}
                    className={`rail-ticker-badge ${isActive ? 'active' : ''} ${isUp ? 'trend-up' : 'trend-down'}`}
                    aria-label={`View ${ticker} on chart`}
                  >
                    <span className="rail-ticker-text">{ticker.slice(0, 4)}</span>
                    <span className={`rail-status-dot ${isUp ? 'up' : 'down'}`}></span>
                  </button>

                  {/* Rich Popover Hover Card */}
                  {hoveredRailTicker === ticker && (
                    <div className="rail-hover-card" role="tooltip">
                      <div className="rail-card-top">
                        <span className="rail-card-ticker">{stock.ticker}</span>
                        <span className={`rail-card-change ${isUp ? 'up' : 'down'}`}>
                          {isUp ? '+' : ''}{(stock.change ?? 0).toFixed(2)}%
                        </span>
                      </div>
                      <div className="rail-card-name">{stock.name}</div>
                      <div className="rail-card-price tabular-nums">
                        {stock.price ? formatMoney(stock.price, detectTickerCurrency(ticker)) : 'Loading...'}
                      </div>
                      <div className="rail-card-footer">Click to view chart</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </aside>
    );
  }

  // =========================================================================
  // RENDER ENRICHED EXPANDED WATCHLIST
  // =========================================================================
  return (
    <section className="panel panel-left" aria-label="Stock Selection">
      {/* Panel Header */}
      <div className="panel-header watchlist-header">
        <div className="watchlist-title-group">
          <div className="watchlist-icon-wrap">
            <i className="fa-solid fa-star"></i>
          </div>
          <h2 className="panel-title">Watchlist</h2>
          <span className="watchlist-count-badge">{watchlist.length} Assets</span>
        </div>
        <button
          onClick={onToggleCollapse}
          className="btn-collapse-watchlist"
          title="Collapse to Mini-Rail"
          aria-label="Collapse Watchlist"
        >
          <i className="fa-solid fa-angles-left"></i>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="watchlist-filter-tabs">
        <button
          onClick={() => setFilter('all')}
          className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
        >
          All
        </button>
        <button
          onClick={() => setFilter('gainers')}
          className={`filter-tab ${filter === 'gainers' ? 'active' : ''}`}
        >
          <i className="fa-solid fa-arrow-trend-up"></i> Gainers
        </button>
        <button
          onClick={() => setFilter('losers')}
          className={`filter-tab ${filter === 'losers' ? 'active' : ''}`}
        >
          <i className="fa-solid fa-arrow-trend-down"></i> Losers
        </button>
      </div>

      {/* Search Bar */}
      <div className="search-box" ref={searchContainerRef}>
        <div className="search-input-container">
          <i className="fa-solid fa-magnifying-glass search-icon"></i>
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onFocus={() => setShowDropdown(true)}
            onKeyDown={handleKeyDown}
            placeholder="Search symbol or company..."
          />
          {isLoadingSuggestions && (
            <i className="fa-solid fa-spinner fa-spin text-cyan search-loading-spinner"></i>
          )}
          {query.length > 0 && !isLoadingSuggestions && (
            <button
              onClick={() => handleQueryChange('')}
              className="clear-btn"
              title="Clear search"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          )}
        </div>

        {/* Live Autocomplete Dropdown */}
        {showDropdown && (
          <div className="search-autocomplete-dropdown">
            {isLoadingSuggestions && suggestions.length === 0 && (
              <div className="autocomplete-loading">
                <i className="fa-solid fa-spinner fa-spin text-cyan"></i>
                <span>Searching markets...</span>
              </div>
            )}

            {!isLoadingSuggestions && suggestions.length === 0 && query.trim().length >= 2 && (
              <div className="autocomplete-empty-state">
                <i className="fa-solid fa-circle-exclamation text-warning"></i>
                <span>No verified stock found for "{query.trim().toUpperCase()}"</span>
              </div>
            )}

            {suggestions.map((item, idx) => {
              const isSelected = idx === activeSuggestionIndex;
              const isAlreadyInWatchlist = watchlist.includes(item.symbol);
              return (
                <div
                  key={`${item.symbol}-${item.exchange}-${idx}`}
                  className={`autocomplete-item ${isSelected ? 'active' : ''} ${isAlreadyInWatchlist ? 'in-watchlist' : ''}`}
                  onClick={() => {
                    handleAddCustom(item.symbol);
                    setShowDropdown(false);
                  }}
                  onMouseEnter={() => setActiveSuggestionIndex(idx)}
                >
                  <div className="autocomplete-left">
                    <span className="autocomplete-symbol">{item.symbol}</span>
                    <span className="autocomplete-name" title={item.name}>{item.name}</span>
                  </div>
                  <div className="autocomplete-right">
                    <span className="autocomplete-tag exchange">{item.exchange}</span>
                    <span className={`autocomplete-tag type ${item.type.toLowerCase()}`}>{item.type}</span>
                    {isAlreadyInWatchlist ? (
                      <span className="autocomplete-in-list" title="Already in watchlist">
                        <i className="fa-solid fa-check"></i>
                      </span>
                    ) : (
                      <span className="autocomplete-add-icon">
                        <i className="fa-solid fa-plus"></i>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {query.trim().length > 0 && (
              <div
                className={`autocomplete-item custom-add ${activeSuggestionIndex === suggestions.length ? 'active' : ''}`}
                onClick={() => {
                  handleAddCustom(query);
                  setShowDropdown(false);
                }}
                onMouseEnter={() => setActiveSuggestionIndex(suggestions.length)}
              >
                <div className="autocomplete-left">
                  <span className="autocomplete-symbol custom-symbol">
                    <i className="fa-solid fa-circle-plus text-cyan"></i>
                  </span>
                  <span className="autocomplete-name">
                    Add custom ticker <strong>"{query.toUpperCase().trim()}"</strong>
                  </span>
                </div>
                <div className="autocomplete-right">
                  <span className="autocomplete-tag custom">Custom</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tracked Assets List */}
      <div className="stock-list-container">
        <ul className="stock-list">
          {filteredTickers.map((ticker) => {
            const stock = { ticker, name: `${ticker} Stock`, price: 0, change: 0, isLive: false, ...stocks[ticker] };
            const isUp = (stock.change ?? 0) >= 0;
            const priceText = stock.price ? formatMoney(stock.price, detectTickerCurrency(ticker)) : '...';
            const isActive = ticker === activeTicker;

            return (
              <li
                key={ticker}
                onClick={() => setActiveTicker(ticker)}
                className={`stock-item ${isActive ? 'active' : ''}`}
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setActiveTicker(ticker)}
              >
                {/* Left: Ticker Symbol & Full Name */}
                <div className="stock-item-left">
                  <div className={`stock-symbol-badge ${isActive ? 'active' : ''}`}>
                    {ticker.slice(0, 3)}
                  </div>
                  <div className="stock-item-info">
                    <span className="stock-item-ticker">{stock.ticker}</span>
                    <span className="stock-item-name" title={stock.name}>{stock.name}</span>
                  </div>
                </div>

                {/* Center: Dynamic Sparkline (real 1D intraday data) */}
                <div className="stock-item-center">
                  <Sparkline isUp={isUp} change={stock.change ?? 0} points={stock.sparklinePoints || null} />
                </div>

                {/* Right: Price, % Change Pill, and Delete */}
                <div className="stock-item-right-wrapper">
                  <div className="stock-item-stats">
                    <span className="stock-item-price tabular-nums">{priceText}</span>
                    {stock.isLive ? (
                      <span className={`stock-item-change ${isUp ? 'up' : 'down'} tabular-nums`}>
                        {isUp ? '+' : ''}{(stock.change ?? 0).toFixed(2)}%
                      </span>
                    ) : (
                      <span className="stock-item-change loading">
                        Syncing...
                      </span>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveTicker(ticker);
                    }}
                    className="btn-watchlist-remove"
                    title={`Remove ${stock.ticker} from watchlist`}
                    aria-label={`Remove ${stock.ticker} from watchlist`}
                  >
                    <i className="fa-solid fa-trash-can"></i>
                  </button>
                </div>
              </li>
            );
          })}

          {/* Empty State when filter yields 0 items */}
          {filteredTickers.length === 0 && query.trim().length === 0 && (
            <div className="watchlist-empty-filter">
              <i className="fa-solid fa-filter-circle-xmark"></i>
              <span>No {filter} found in your watchlist</span>
            </div>
          )}
        </ul>
      </div>
    </section>
  );
}