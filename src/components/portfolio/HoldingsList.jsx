import { useState } from 'react';
import { AssetMark } from '../ui/Controls.jsx';
import { formatMoney } from '../../utils/currencyUtils.js';

const SORT_OPTIONS = [
  ['ticker', 'Asset'], ['shares', 'Shares'], ['avgCost', 'Average cost'],
  ['currentPrice', 'Market price'], ['totalCost', 'Total cost'],
  ['marketValue', 'Market value'], ['pnlVal', 'Unrealized P&L'],
];

export default function HoldingsList({ holdings, activePortfolio, totalAssetValue, baseCurrency,
  sortColumn, sortDirection, onSort, onSellAll, onRefresh, isRefreshing }) {
  const [query, setQuery] = useState('');
  const visibleHoldings = holdings.filter(holding =>
    `${holding.ticker} ${holding.name}`.toLowerCase().includes(query.trim().toLowerCase()));

  return <section className="positions" aria-label="Portfolio holdings">
    <header className="positions-heading">
      <div><h3>Your holdings <span>{holdings.length}</span></h3><p className="holdings-currency-note">Market value and P&L in {baseCurrency}. Prices and costs in each asset’s currency.</p></div>
      {holdings.length > 0 && <button type="button" className="portfolio-quiet-button" onClick={onRefresh} disabled={isRefreshing} aria-label="Refresh stock prices"><span aria-hidden="true">↻</span>{isRefreshing ? 'Refreshing…' : 'Refresh prices'}</button>}
    </header>
    {holdings.length > 0 && <div className="positions-toolbar">
      <label className="positions-search"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></svg><input type="search" aria-label="Find a holding" placeholder="Find a holding" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <div className="positions-sort"><label>Sort by<select aria-label="Sort holdings" value={sortColumn} onChange={event => onSort(event.target.value)}>{SORT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button type="button" onClick={() => onSort(sortColumn)} aria-label={`Sort ${sortDirection === 'asc' ? 'descending' : 'ascending'}`}>{sortDirection === 'asc' ? '↑' : '↓'}</button></div>
    </div>}
    {holdings.length === 0 ? <div className="portfolio-empty-state" id="emptyPortfolioState"><span aria-hidden="true">↗</span><h4>A place for your investments</h4><p>Record your first purchase to see your holdings, allocation, and performance here.</p></div> : <>
      <div className="position-column-headings" aria-hidden="true"><span>Asset / shares</span><span>Market value</span><span>Unrealized P&L</span><span>Allocation</span><span /></div>
      <div className="positions-list">{visibleHoldings.map(holding => {
        const weight = totalAssetValue > 0 ? holding.baseMarketValue / totalAssetValue * 100 : 0;
        const target = parseFloat(activePortfolio.targetAllocations?.[holding.ticker]) || 0;
        const drift = weight - target;
        const dividends = activePortfolio.dividendsByTicker?.[holding.ticker] || activePortfolio.holdings?.[holding.ticker]?.totalDividends || 0;
        return <details className="position" key={holding.ticker}>
          <summary aria-label={`Position details for ${holding.ticker}`}>
            <span className="position-identity"><AssetMark ticker={holding.ticker} /><span><strong>{holding.ticker}</strong><span className="position-company">{holding.name}</span><small className="tabular-nums">{parseFloat(Number(holding.shares || 0).toFixed(6))} shares · {holding.currency}</small></span></span>
            <span className="position-value tabular-nums"><small>Market value</small><strong>{formatMoney(holding.baseMarketValue, baseCurrency)}</strong><span>{formatMoney(holding.currentPrice, holding.currency)} / share</span></span>
            <span className={`position-gain tabular-nums ${holding.basePnlVal >= 0 ? 'text-green' : 'text-red'}`}><small>Unrealized P&L</small><strong>{holding.basePnlVal >= 0 ? '+' : ''}{formatMoney(holding.basePnlVal, baseCurrency)}</strong><span>{holding.basePnlVal >= 0 ? '+' : ''}{holding.pnlPct.toFixed(2)}%</span></span>
            <span className="position-allocation tabular-nums"><small>Allocation</small><strong>{weight.toFixed(1)}%</strong><span className="position-weight-track" aria-hidden="true"><span style={{ width: `${Math.min(100, weight)}%` }} />{target > 0 && <i style={{ left: `${Math.min(100, target)}%` }} />}</span><span>{target > 0 ? `Target ${target.toFixed(1)}%` : 'No target set'}</span></span>
            <span className="position-disclosure" aria-hidden="true">⌄</span>
          </summary>
          <div className="position-detail">
            <dl><div><dt>Shares</dt><dd>{parseFloat(Number(holding.shares || 0).toFixed(6))}</dd></div><div><dt>Average cost · {holding.currency}</dt><dd>{formatMoney(holding.avgCost, holding.currency)}</dd></div><div><dt>Market price · {holding.currency}</dt><dd>{formatMoney(holding.currentPrice, holding.currency)}</dd></div><div><dt>Total cost · {holding.currency}</dt><dd>{formatMoney(holding.totalCost, holding.currency)}</dd></div><div><dt>Dividend income · {holding.currency}</dt><dd>{formatMoney(dividends, holding.currency)}</dd></div><div><dt>Allocation drift</dt><dd>{target > 0 ? `${drift > 0 ? '+' : ''}${drift.toFixed(1)} percentage points` : 'Set a target in Rebalance'}</dd></div></dl>
            <div className="position-detail-footer"><span>Position in {holding.currency} · Portfolio in {baseCurrency}</span><button type="button" className="position-sell" aria-label={`Sell All ${holding.ticker} shares`} title="Review a sale of all shares in Record transaction" onClick={() => onSellAll(holding.ticker, holding.shares, holding.currentPrice)}>Sell All<span className="visually-hidden"> {holding.ticker} shares</span><span aria-hidden="true"> ↗</span></button></div>
          </div>
        </details>;
      })}</div>
      {visibleHoldings.length === 0 && <p className="positions-no-results" role="status">No holdings match “{query}”. Try another symbol or company.</p>}
      <p className="positions-footnote">Select a holding for cost details, dividends, and position actions.</p>
    </>}
  </section>;
}
