import React, { useState } from 'react';
import { Search, Star, X, PlusCircle, Trash2 } from 'lucide-react';

export default function Watchlist({
  watchlist,
  activeTicker,
  setActiveTicker,
  stocks,
  onRemoveTicker,
  onAddTicker
}) {
  const [query, setQuery] = useState('');

  const filteredTickers = watchlist.filter((ticker) => {
    const stock = stocks[ticker] || {};
    return (
      ticker.toLowerCase().includes(query.toLowerCase()) ||
      (stock.name && stock.name.toLowerCase().includes(query.toLowerCase()))
    );
  });

  const exactMatchInWatchlist = watchlist.some(
    (ticker) => ticker.toLowerCase() === query.trim().toLowerCase()
  );

  const handleAddCustom = () => {
    const cleanQuery = query.toUpperCase().trim();
    if (cleanQuery) {
      onAddTicker(cleanQuery);
      setQuery('');
    }
  };

  return (
    <section className="panel panel-left" aria-label="Stock Selection">
      <div className="panel-header">
        <h2 className="panel-title">
          <><Star size={14} /> Watchlist</>
        </h2>
      </div>

      <div className="search-box">
        <div className="search-input-container">
          <Search size={14} className="search-icon" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ticker or company name..."
          />
          {query.length > 0 && (
            <button
              onClick={() => setQuery('')}
              className="clear-btn"
              title="Clear search"
              style={{ display: 'block' }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="stock-list-container">
        <div className="list-section-title">My Tracked Assets</div>
        <ul className="stock-list">
          {filteredTickers.map((ticker) => {
            const stock = { ticker, name: `${ticker} Stock`, price: 0, change: 0, isLive: false, ...stocks[ticker] };
            const isUp = (stock.change ?? 0) >= 0;
            const priceText = stock.price ? `$${stock.price.toFixed(2)}` : '...';

            return (
              <li
                key={ticker}
                onClick={() => setActiveTicker(ticker)}
                className={`stock-item ${ticker === activeTicker ? 'active' : ''}`}
              >
                <div className="stock-item-info">
                  <span className="stock-item-ticker">{stock.ticker}</span>
                  <span className="stock-item-name">{stock.name}</span>
                </div>
                <div className="stock-item-right-wrapper">
                  <div className="stock-item-stats">
                    <span className="stock-item-price">{priceText}</span>
                    {stock.isLive ? (
                      <span className={`stock-item-change ${isUp ? 'up' : 'down'}`}>
                        {isUp ? '+' : ''}
                        {(stock.change ?? 0).toFixed(2)}%
                      </span>
                    ) : (
                      <span
                        className="stock-item-change"
                        style={{
                          opacity: 0.5,
                          color: 'var(--text-muted)',
                          background: 'rgba(255, 255, 255, 0.03)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 600,
                        }}
                      >
                        Loading...
                      </span>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveTicker(ticker);
                    }}
                    className="btn-watchlist-remove"
                    title="Remove from watchlist"
                    aria-label={`Remove ${stock.ticker} from watchlist`}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </li>
            );
          })}

          {query.trim().length > 0 && !exactMatchInWatchlist && (
            <li
              onClick={handleAddCustom}
              className="stock-item add-custom-item"
            >
              <div className="stock-item-info">
                <span className="stock-item-ticker" style={{ color: 'var(--cyan)' }}>
                  <PlusCircle size={12} /> Add '{query.toUpperCase().trim()}'
                </span>
                <span className="stock-item-name">Add to your active watchlist</span>
              </div>
              <div className="stock-item-stats">
                <span className="stock-item-price" style={{ fontSize: '11px', opacity: 0.6 }}>
                  Fetch Live
                </span>
              </div>
            </li>
          )}
        </ul>
      </div>
    </section>
  );
}
