import { AssetMark } from '../ui/Controls.jsx';
import { detectTickerCurrency, formatMoney } from '../../utils/currencyUtils.js';

const sections = [
  { id: 'chart', label: 'Price chart', description: 'Price history and indicators' },
  { id: 'company', label: 'Company', description: 'Fundamentals, profile and analyst views' },
  { id: 'analysis', label: 'Analysis', description: 'Levels, holdings and scenarios' },
];

/** Presentation slots leave the existing data, chart and ledger owners intact. */
export default function ResearchWorkspace({ section, onSectionChange, ticker, stock = {},
  count, collapsed, watchlist, chart, analysis, onRefresh, loading }) {
  const currency = detectTickerCurrency(ticker);
  const hasQuote = Number.isFinite(Number(stock.price)) && Number(stock.price) > 0;
  const hasChange = hasQuote && stock.change !== undefined && stock.change !== null && stock.change !== '' && Number.isFinite(Number(stock.change));
  const change = Number(stock.change);
  const activeSection = section === 'watchlist' ? 'chart' : section;
  return <section id="viewResearch" className={`research-workspace ${collapsed ? 'research-rail' : ''} ${section === 'watchlist' ? 'research-show-watchlist' : ''}`} aria-label="Stock research">
    <aside className="research-watchlist" aria-label="Research watchlist">{watchlist}</aside>
    <div className="research-document">
      <header className="research-quote">
        <div className="research-company-identity"><AssetMark ticker={ticker} /><div><p>{ticker} <span>{currency}</span></p><h2>{stock.name || ticker}</h2></div></div>
        <div className="research-quote-value"><strong className="tabular-nums">{hasQuote ? formatMoney(stock.price, currency) : '—'}</strong><div>{hasChange && <span className={`tabular-nums ${change >= 0 ? 'text-green' : 'text-red'}`}>{change >= 0 ? '+' : ''}{change.toFixed(2)}%</span>}<small>{loading ? 'Updating quote…' : 'Latest available quote'}</small></div></div>
        <button type="button" className="research-refresh" onClick={onRefresh} disabled={loading} aria-label="Refresh price data"><span aria-hidden="true">↻</span><span>{loading ? 'Updating' : 'Refresh'}</span></button>
      </header>
      <div className="research-navigation"><nav aria-label="Stock research sections">{sections.map(item => <button key={item.id} type="button" aria-pressed={activeSection === item.id} onClick={() => onSectionChange(item.id)} title={item.description}>{item.label}</button>)}</nav><button type="button" className="research-watchlist-trigger" onClick={() => onSectionChange(section === 'watchlist' ? 'chart' : 'watchlist')} aria-pressed={section === 'watchlist'}>Watchlist <span>{count}</span></button></div>
      <div className="research-chart-slot" hidden={activeSection === 'analysis'}>{chart}</div>
      <div className="research-analysis-slot" hidden={activeSection !== 'analysis'}>{analysis}</div>
    </div>
  </section>;
}
