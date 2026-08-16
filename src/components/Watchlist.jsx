import React, { useState, useRef, useEffect } from 'react';

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
  const searchInputRef = useRef(null);
  const railSearchInputRef = useRef(null);

  useEffect(() => {
    if (showRailSearch && railSearchInputRef.current) {
      railSearchInputRef.current.focus();
    }
  }, [showRailSearch]);

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

  const exactMatchInWatchlist = watchlist.some(
    (ticker) => ticker.toLowerCase() === query.trim().toLowerCase()
  );

  const handleAddCustom = (tickerToAdd) => {
    const cleanQuery = (tickerToAdd || query).toUpperCase().trim();
    if (cleanQuery) {
      onAddTicker(cleanQuery);
      setQuery('');
      setShowRailSearch(false);
    }
  };

  const handleRailSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleAddCustom();
    } else if (e.key === 'Escape') {
      setShowRailSearch(false);
      setQuery('');
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
              onClick={() => setShowRailSearch(!showRailSearch)}
              className={`rail-add-btn ${showRailSearch ? 'active' : ''}`}
              title="Quick Add Ticker"
              aria-label="Quick Add Ticker"
            >
              <i className="fa-solid fa-plus"></i>
            </button>
          </div>

          {/* Quick Search Popover when clicked + in Mini-Rail */}
          {showRailSearch && (
            <div className="rail-search-popover">
              <div className="rail-search-header">
                <i className="fa-solid fa-magnifying-glass"></i>
                <input
                  ref={railSearchInputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleRailSearchKeyDown}
                  placeholder="Enter Ticker (e.g. AMD)..."
                />
                <button onClick={() => setShowRailSearch(false)} className="rail-search-close">
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>
              {query.trim().length > 0 && !exactMatchInWatchlist && (
                <button
                  onClick={() => handleAddCustom()}
                  className="rail-search-add-btn"
                >
                  <i className="fa-solid fa-circle-plus"></i> Add '{query.toUpperCase().trim()}'
                </button>
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
                        {stock.price ? `$${stock.price.toFixed(2)}` : 'Loading...'}
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
      <div className="search-box">
        <div className="search-input-container">
          <i className="fa-solid fa-magnifying-glass search-icon"></i>
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search symbol or company..."
          />
          {query.length > 0 && (
            <button
              onClick={() => setQuery('')}
              className="clear-btn"
              title="Clear search"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          )}
        </div>
      </div>

      {/* Tracked Assets List */}
      <div className="stock-list-container">
        <ul className="stock-list">
          {filteredTickers.map((ticker) => {
            const stock = { ticker, name: `${ticker} Stock`, price: 0, change: 0, isLive: false, ...stocks[ticker] };
            const isUp = (stock.change ?? 0) >= 0;
            const priceText = stock.price ? `$${stock.price.toFixed(2)}` : '...';
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

          {/* Quick Add Custom Symbol Item */}
          {query.trim().length > 0 && !exactMatchInWatchlist && (
            <li
              onClick={() => handleAddCustom()}
              className="stock-item add-custom-item"
            >
              <div className="stock-item-left">
                <div className="stock-symbol-badge add-badge">
                  <i className="fa-solid fa-plus"></i>
                </div>
                <div className="stock-item-info">
                  <span className="stock-item-ticker" style={{ color: 'var(--cyan)' }}>
                    Add '{query.toUpperCase().trim()}'
                  </span>
                  <span className="stock-item-name">Fetch quote & add to watchlist</span>
                </div>
              </div>
              <div className="stock-item-stats">
                <span className="stock-item-price" style={{ fontSize: '11px', color: 'var(--cyan)' }}>
                  Fetch Live <i className="fa-solid fa-bolt" style={{ marginLeft: '4px' }}></i>
                </span>
              </div>
            </li>
          )}
        </ul>
      </div>
    </section>
  );
}