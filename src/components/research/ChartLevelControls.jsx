import { useRef, useState } from 'react';
import { SegmentedControl } from '../ui/Controls.jsx';
import { detectTickerCurrency, formatMoney } from '../../utils/currencyUtils.js';

export default function ChartLevelControls({ controller, ticker, currentPrice }) {
  const dialogRef = useRef(null);
  const manageButtonRef = useRef(null);
  const [price, setPrice] = useState('');
  const currency = detectTickerCurrency(ticker);
  const hasQuote = Number.isFinite(currentPrice) && currentPrice > 0;
  const closeManager = () => dialogRef.current?.close();
  const describeLevel = value => !hasQuote ? 'Price level' : value > currentPrice ? 'Resistance' : 'Support';
  const formatDistance = value => !hasQuote ? 'Quote unavailable' : `${value >= currentPrice ? '+' : ''}${((value - currentPrice) / currentPrice * 100).toFixed(2)}% from current price`;
  const submitPrice = event => {
    event.preventDefault();
    if (controller.addLevel(price)) setPrice('');
  };

  return <div className="chart-levels-workspace">
    <div className="chart-levels-toolbar">
      <div className="chart-levels-display"><span>Levels</span><SegmentedControl label="Price level visibility" value={controller.mode} onChange={controller.setMode} options={[{ value: 'off', label: 'Off' }, { value: 'key', label: 'Key' }, { value: 'all', label: 'All' }]} /></div>
      <div className="chart-levels-actions"><button type="button" ref={node => controller.bindAddButton(node)} className={`chart-level-button ${controller.drawing ? 'is-active' : ''}`} aria-pressed={controller.drawing} disabled={!hasQuote} onClick={controller.drawing ? controller.cancelDrawing : controller.startDrawing}><span aria-hidden="true">{controller.drawing ? '×' : '+'}</span>{controller.drawing ? 'Cancel adding' : 'Add level'}</button><button type="button" className="chart-level-button" ref={manageButtonRef} onClick={() => { if (controller.drawing) controller.cancelDrawing(); dialogRef.current?.showModal(); }}>Manage levels <span className="chart-level-count">{controller.levels.length}</span></button></div>
    </div>
    <p className="chart-levels-caption">{controller.drawing ? 'Tap or click a price to add one level. Escape cancels.' : controller.mode === 'key' ? 'Nearest support and resistance, plus your selected level.' : controller.mode === 'all' ? 'All saved levels and price labels. Select a level to highlight it.' : 'Levels hidden. Your saved prices are kept.'}</p>
    <span className="visually-hidden" role="status">{controller.message}</span>
    <dialog className="chart-level-dialog" aria-labelledby="chart-level-dialog-title" ref={dialogRef} onClose={() => manageButtonRef.current?.focus()}>
      <header><div><span className="chart-level-eyebrow">{ticker} · {currency}</span><h3 id="chart-level-dialog-title">Price levels</h3><p>Select a price to highlight it on the chart.</p></div><button type="button" className="chart-level-close" aria-label="Close level manager" onClick={closeManager}>×</button></header>
      <div className="chart-level-dialog-content">
        <div className="chart-level-quote"><span>Current price</span><strong className="tabular-nums">{hasQuote ? formatMoney(currentPrice, currency) : 'Unavailable'}</strong></div>
        {controller.levels.length === 0 ? <div className="chart-level-empty"><strong>No saved levels yet</strong><p>Add a price below, or use Add level to place one on the chart. Auto Levels is available in Analysis.</p></div> : <ul className="chart-level-list">{controller.levels.map(value => <li key={value} className={hasQuote ? value > currentPrice ? 'resistance' : 'support' : ''}>
          <button type="button" className="chart-level-select" aria-pressed={controller.selected === value} aria-label={`Highlight level ${formatMoney(value, currency)}`} onClick={() => { controller.selectLevel(value); closeManager(); }}><span className="chart-level-kind"><span aria-hidden="true" />{describeLevel(value)}</span><strong className="tabular-nums">{formatMoney(value, currency)}</strong><small className="tabular-nums">{formatDistance(value)}</small></button>
          <button type="button" className="chart-level-remove" aria-label={`Remove level ${formatMoney(value, currency)}`} onClick={() => controller.removeLevel(value)}>×</button>
        </li>)}</ul>}
        <form className="chart-level-price-form" onSubmit={submitPrice}><label htmlFor="new-chart-level">Add by price <span>{currency}</span></label><div><input id="new-chart-level" type="number" min="0.01" step="0.01" inputMode="decimal" required value={price} onChange={event => setPrice(event.target.value)} placeholder="0.00" /><button type="submit">Add price</button></div><p role="status">{controller.message}</p></form>
      </div>
      <footer><p>Removing a level also removes it from the Analysis list.</p><button type="button" className="chart-level-button" onClick={() => { closeManager(); controller.startDrawing(); controller.focusAddButton(); }} disabled={!hasQuote}>Place on chart <span aria-hidden="true">↗</span></button></footer>
    </dialog>
  </div>;
}
