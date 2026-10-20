import { SegmentedControl } from './ui/Controls.jsx';
import HoldingsList from './portfolio/HoldingsList.jsx';
import { useAppearance, systemFont } from '../theme/appearanceContext.js';
import { formatPerformanceAxisValue } from '../utils/chartUtils.js';
import { investedCapital } from '../utils/portfolioLedger.js';
import { useState, useEffect, useRef, useMemo } from 'react';
import { Chart, registerables } from 'chart.js';
import RebalanceStudio from './RebalanceStudio';
import AllocationDonut from './portfolio/AllocationDonut';
import {
  detectTickerCurrency,
  formatMoney,
  convertCurrency
} from '../utils/currencyUtils';

Chart.register(...registerables);

export default function PerformanceHoldings({
  portfolios,
  activePortfolioId,
  stocks,
  onAddTransaction,
  onResetPortfolio,
  onImportCSV,
  onExportCSV,
  onRefreshPrices,
  onFetchPortfolioHistory,
  onUpdateTargetAllocations,
  onExecuteRebalance,
  onPrefillTrade,
  showNotification
}) {
  const { palette } = useAppearance();
  const performanceCanvasRef = useRef(null);
  const performanceChartRef = useRef(null);
  const fileInputRef = useRef(null);
  const [mountTime] = useState(() => Date.now());

  // Sorting state for active holdings table
  const [portfolioSection, setPortfolioSection] = useState('holdings');
  const [sortColumn, setSortColumn] = useState('marketValue');
  const [sortDirection, setSortDirection] = useState('desc');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [chartMode, setChartMode] = useState('total'); // 'total' | 'unrealized'
  const [timeRange, setTimeRange] = useState('ALL'); // '1W' | '1M' | '1Y' | 'ALL'

  const activePortfolio = useMemo(() => {
    return portfolios.find(p => p.id === activePortfolioId) || {
      id: 'default',
      name: 'Primary Portfolio',
      holdings: {},
      transactions: [],
      realizedPL: 0,
      baseCurrency: 'USD'
    };
  }, [portfolios, activePortfolioId]);

  const baseCurrency = activePortfolio.baseCurrency || 'USD';
  const fxRate = parseFloat(stocks['USDTHB=X']?.price) || 35.5;

  let totalAssetValue = 0;
  let totalCostBasis = 0;

  const holdingsKeys = Object.keys(activePortfolio.holdings || {});
  const rawHoldings = holdingsKeys
    .filter(ticker => (activePortfolio.holdings[ticker]?.shares || 0) > 0)
    .map(ticker => {
      const holding = activePortfolio.holdings[ticker];
      const stockMeta = stocks[ticker] || { price: holding.avgCost, name: `${ticker} Stock` };
      const stockPrice = stockMeta.price || holding.avgCost;
      const nativeCost = (holding.shares * holding.avgCost) + (holding.totalFees || 0);
      const nativeMarketValue = holding.shares * stockPrice;
      const nativePnlVal = nativeMarketValue - nativeCost;
      const pnlPct = nativeCost > 0 ? (nativePnlVal / nativeCost) * 100 : 0;
      const currency = detectTickerCurrency(ticker);

      const baseMarketValue = convertCurrency(nativeMarketValue, currency, baseCurrency, fxRate);
      const baseCost = convertCurrency(nativeCost, currency, baseCurrency, fxRate);
      const basePnlVal = baseMarketValue - baseCost;

      totalAssetValue += baseMarketValue;
      totalCostBasis += baseCost;

      return {
        ticker,
        name: stockMeta.name || `${ticker} Stock`,
        shares: holding.shares,
        avgCost: holding.avgCost,
        currentPrice: stockPrice,
        currency,
        totalCost: nativeCost,
        marketValue: nativeMarketValue,
        pnlVal: nativePnlVal,
        pnlPct,
        baseMarketValue,
        baseCost,
        basePnlVal
      };
    });

  const netProfit = totalAssetValue - totalCostBasis;
  const netReturnPct = totalCostBasis > 0 ? (netProfit / totalCostBasis) * 100 : 0;

  // Realized P&L in base currency
  const realizedPL = activePortfolio.realizedPLByCurrency
    ? (convertCurrency(activePortfolio.realizedPLByCurrency.USD || 0, 'USD', baseCurrency, fxRate) +
       convertCurrency(activePortfolio.realizedPLByCurrency.THB || 0, 'THB', baseCurrency, fxRate))
    : convertCurrency(activePortfolio.realizedPL || 0, 'USD', baseCurrency, fxRate);

  // Total Dividend Income in base currency
  const totalDividends = activePortfolio.dividendsByCurrency
    ? (convertCurrency(activePortfolio.dividendsByCurrency.USD || 0, 'USD', baseCurrency, fxRate) +
       convertCurrency(activePortfolio.dividendsByCurrency.THB || 0, 'THB', baseCurrency, fxRate))
    : convertCurrency(activePortfolio.totalDividends || 0, 'USD', baseCurrency, fxRate);

  // Total Net Return = Open Gains (netProfit) + Closed Gains (realizedPL) + Total Dividend Income
  const totalReturnVal = netProfit + realizedPL + totalDividends;
  const lifetimePurchaseCost = investedCapital(activePortfolio.transactions || [], baseCurrency, fxRate);
  const totalReturnPct = lifetimePurchaseCost > 0 ? (totalReturnVal / lifetimePurchaseCost) * 100 : 0;

  const sortedHoldings = [...rawHoldings].sort((a, b) => {
    let valA = a[sortColumn];
    let valB = b[sortColumn];

    if (valA === valB) return 0;
    if (typeof valA === 'string' || typeof valB === 'string') {
      return sortDirection === 'asc'
        ? String(valA || '').localeCompare(String(valB || ''))
        : String(valB || '').localeCompare(String(valA || ''));
    } else {
      const numA = typeof valA === 'number' && !isNaN(valA) ? valA : 0;
      const numB = typeof valB === 'number' && !isNaN(valB) ? valB : 0;
      return sortDirection === 'asc' ? numA - numB : numB - numA;
    }
  });

  const handleSort = (col) => {
    if (sortColumn === col) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(col);
      setSortDirection(col === 'ticker' ? 'asc' : 'desc');
    }
  };

  useEffect(() => {
    if (!performanceCanvasRef.current) return;

    if (performanceChartRef.current) {
      performanceChartRef.current.destroy();
      performanceChartRef.current = null;
    }

    const txs = [...(activePortfolio?.transactions || [])].sort((a, b) => {
      const timeA = typeof a.timestamp === 'number' ? a.timestamp : new Date(a.date || a.timestamp || 0).getTime();
      const timeB = typeof b.timestamp === 'number' ? b.timestamp : new Date(b.date || b.timestamp || 0).getTime();
      return timeA - timeB;
    });
    if (txs.length === 0) return;

    let earliestActiveTimestamp = Infinity;
    txs.forEach(tx => {
      const txTime = typeof tx.timestamp === 'number' ? tx.timestamp : new Date(tx.date || tx.timestamp || 0).getTime();
      if (tx.type === 'BUY' && txTime < earliestActiveTimestamp && !isNaN(txTime)) {
        earliestActiveTimestamp = txTime;
      }
    });

    if (earliestActiveTimestamp === Infinity) {
      const firstTime = typeof txs[0].timestamp === 'number' ? txs[0].timestamp : new Date(txs[0].date || txs[0].timestamp || 0).getTime();
      earliestActiveTimestamp = !isNaN(firstTime) ? firstTime : Date.now();
    }

    const startDate = new Date(earliestActiveTimestamp);
    const endDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);

    const diffDays = Math.max(1, Math.ceil(Math.abs(endDate - startDate) / (1000 * 60 * 60 * 24)));
    const stepDays = (diffDays <= 30) ? 1 : 7;
    const stepMs = stepDays * 24 * 60 * 60 * 1000;

    const timelineDates = [];
    let currentSimDate = new Date(startDate.getTime());
    while (currentSimDate <= endDate) {
      timelineDates.push(new Date(currentSimDate.getTime()));
      currentSimDate.setTime(currentSimDate.getTime() + stepMs);
    }
    if (timelineDates.length === 0 || timelineDates[timelineDates.length - 1].getTime() !== endDate.getTime()) {
      timelineDates.push(new Date(endDate.getTime()));
    }

    const parseLocalDate = (dateStr) => {
      if (!dateStr) return new Date(0);
      if (typeof dateStr !== 'string') {
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? new Date(0) : d;
      }
      if (dateStr.includes('-')) {
        const parts = dateStr.split(' ')[0].split('T')[0].split('-').map(Number);
        if (parts.length === 3 && !parts.some(isNaN)) {
          return new Date(parts[0], parts[1] - 1, parts[2]);
        }
      }
      const parsed = new Date(dateStr);
      return isNaN(parsed.getTime()) ? new Date(0) : parsed;
    };

    const getPriceOnDate = (ticker, targetDate, fallbackPrice) => {
      const stock = stocks[ticker];
      if (!stock) return fallbackPrice;

      const closes = stock.portfolioHistory || stock.liveCloses || [];
      const labels = stock.portfolioLabels || stock.liveLabels || [];
      const livePrice = parseFloat(stock.price) || 0;

      if (closes.length > 0 && labels.length === closes.length) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const compareDate = new Date(targetDate.getTime());
        compareDate.setHours(0, 0, 0, 0);

        if (compareDate.getTime() === today.getTime() && livePrice > 0) return livePrice;

        let exactIndex = -1;
        labels.forEach((label, idx) => {
          const labelDate = parseLocalDate(label);
          if (labelDate.getTime() === compareDate.getTime()) exactIndex = idx;
        });
        if (exactIndex !== -1) {
          const p = parseFloat(closes[exactIndex]);
          return (p && !isNaN(p) && p > 0) ? p : fallbackPrice;
        }

        let bestIdx = -1;
        let bestDiff = Infinity;
        labels.forEach((label, idx) => {
          const labelDate = parseLocalDate(label);
          const diff = compareDate.getTime() - labelDate.getTime();
          if (diff >= 0 && diff < bestDiff) {
            bestDiff = diff;
            bestIdx = idx;
          }
        });
        if (bestIdx !== -1) {
          const p = parseFloat(closes[bestIdx]);
          return (p && !isNaN(p) && p > 0) ? p : fallbackPrice;
        }
      }
      return fallbackPrice;
    };

    const points = [];
    const holdingsOnDate = {};
    let cumulativeRealizedPL = 0;
    let txIdx = 0;

    timelineDates.forEach(D => {
      const endOfDayMs = D.getTime() + 86399999;
      const fxRateOnDate = getPriceOnDate('USDTHB=X', D, fxRate);

      while (txIdx < txs.length) {
        const tx = txs[txIdx];
        const txTime = typeof tx.timestamp === 'number' ? tx.timestamp : new Date(tx.date || tx.timestamp || 0).getTime();
        if (txTime > endOfDayMs) break;

        const ticker = tx.ticker;
        const txPrice = parseFloat(tx.price) || 0;
        const txShares = parseFloat(tx.shares) || 0;
        const txFees = parseFloat(tx.fees) || 0;
        const txCurr = detectTickerCurrency(ticker);

        if (tx.type === 'BUY') {
          if (!holdingsOnDate[ticker]) {
            holdingsOnDate[ticker] = { shares: 0, avgCost: 0, totalFees: 0, lastPrice: txPrice, currency: txCurr };
          }
          const h = holdingsOnDate[ticker];
          const newPureTotalCost = (h.shares * h.avgCost) + (txShares * txPrice);
          h.shares += txShares;
          h.avgCost = h.shares > 0 ? (newPureTotalCost / h.shares) : 0;
          h.totalFees = (h.totalFees || 0) + txFees;
          h.lastPrice = txPrice;
        } else if (tx.type === 'SELL') {
          if (holdingsOnDate[ticker]) {
            const h = holdingsOnDate[ticker];
            const originalShares = h.shares;
            const soldShares = Math.min(originalShares, txShares);
            const proportionalBuyFee = originalShares > 0 ? (soldShares / originalShares) * (h.totalFees || 0) : 0;
            const saleRealizedGainNative = (txPrice - h.avgCost) * soldShares - txFees - proportionalBuyFee;

            const txFxRate = getPriceOnDate('USDTHB=X', new Date(txTime), fxRate);
            const saleRealizedGainBase = convertCurrency(saleRealizedGainNative, h.currency, baseCurrency, txFxRate);
            cumulativeRealizedPL += (isNaN(saleRealizedGainBase) ? 0 : saleRealizedGainBase);

            h.shares = Math.max(0, h.shares - soldShares);
            h.totalFees = originalShares > 0 ? (h.totalFees || 0) * (h.shares / originalShares) : 0;
            h.lastPrice = txPrice;
            if (h.shares < 1e-9) delete holdingsOnDate[ticker];
          }
        } else if (tx.type === 'DIVIDEND') {
          const grossDivNative = txShares * txPrice;
          const netDivNative = Math.max(0, grossDivNative - txFees);
          const txFxRate = getPriceOnDate('USDTHB=X', new Date(txTime), fxRate);
          const divBase = convertCurrency(netDivNative, txCurr, baseCurrency, txFxRate);
          cumulativeRealizedPL += (isNaN(divBase) ? 0 : divBase);
        }
        txIdx++;
      }

      let unrealizedPLOnDate = 0;
      Object.keys(holdingsOnDate).forEach(t => {
        const h = holdingsOnDate[t];
        if (h.shares > 0) {
          const price = getPriceOnDate(t, D, h.lastPrice || h.avgCost || 0);
          const totalCostOnDateNative = (h.shares * h.avgCost) + (h.totalFees || 0);
          const marketValueOnDateNative = h.shares * price;
          const unrealizedNative = marketValueOnDateNative - totalCostOnDateNative;
          const unrealizedBase = convertCurrency(unrealizedNative, h.currency, baseCurrency, fxRateOnDate);
          unrealizedPLOnDate += unrealizedBase;
        }
      });

      const totalPLOnDate = cumulativeRealizedPL + unrealizedPLOnDate;
      points.push({
        x: D,
        y: chartMode === 'total' ? totalPLOnDate : unrealizedPLOnDate
      });
    });

    // Apply Time Range Cutoff Filter
    let cutoffTime = 0;
    const now = mountTime;
    if (timeRange === '1W') cutoffTime = now - 7 * 24 * 60 * 60 * 1000;
    else if (timeRange === '1M') cutoffTime = now - 30 * 24 * 60 * 60 * 1000;
    else if (timeRange === '1Y') cutoffTime = now - 365 * 24 * 60 * 60 * 1000;
    else if (timeRange === '5Y') cutoffTime = now - 5 * 365 * 24 * 60 * 60 * 1000;

    let filteredPoints = points;
    if (cutoffTime > 0) {
      filteredPoints = points.filter(p => p.x.getTime() >= cutoffTime);
      if (filteredPoints.length === 0 && points.length > 0) {
        filteredPoints = [points[points.length - 1]];
      }
    }

    if (filteredPoints.length === 1) {
      const prevDate = new Date(filteredPoints[0].x.getTime() - 24 * 60 * 60 * 1000);
      filteredPoints.unshift({ x: prevDate, y: filteredPoints[0].y });
    }

    filteredPoints.sort((a, b) => a.x.getTime() - b.x.getTime());
    const labels = filteredPoints.map(p => p.x.toLocaleDateString([], { month: 'short', day: 'numeric' }));
    const data = filteredPoints.map(p => parseFloat(p.y.toFixed(2)) || 0);

    const ctx = performanceCanvasRef.current.getContext('2d');
    const isOverallGain = data.length > 0 && data[data.length - 1] >= 0;
    const accentColor = isOverallGain ? palette.positive : palette.negative;

    const gradient = ctx.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, `${accentColor}30`);
    gradient.addColorStop(1, `${accentColor}00`);

    const datasetLabel = chartMode === 'total' ? 'Total P&L' : 'Unrealized P&L';

    performanceChartRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: datasetLabel,
          data: data,
          borderColor: accentColor,
          borderWidth: 2.5,
          backgroundColor: gradient,
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointHitRadius: 12,
          pointBackgroundColor: accentColor,
          pointBorderColor: palette.surface,
          pointBorderWidth: 2,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        // Financial values update immediately, including when reduced motion is enabled.
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            displayColors: false,
            backgroundColor: palette.tooltip,
            titleColor: palette.tooltipText,
            bodyColor: palette.tooltipText,
            borderColor: palette.grid,
            borderWidth: 1,
            titleFont: { family: systemFont, weight: '700', size: 12 },
            bodyFont: { family: systemFont, size: 11 },
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label: function (context) {
                const val = context.parsed.y;
                const sign = val >= 0 ? '+' : '';
                return `${context.dataset.label}: ${sign}${formatMoney(val, baseCurrency)}`;
              }
            }
          }
        },
        scales: {
          x: { grid: { color: palette.grid, drawBorder: false }, ticks: { color: palette.muted, font: { family: systemFont, size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
          y: {
            display: true,
            position: 'left',
            border: { display: false },
            grid: { color: palette.grid },
            // Use left-aligned labels and a system font to keep text inside the axis gutter.
            afterFit: scale => { scale.width = Math.max(scale.width, 104); },
            ticks: {
              display: true,
              color: palette.muted,
              font: { family: 'Arial, sans-serif', size: 12 },
              crossAlign: 'far',
              padding: 8,
              maxTicksLimit: 6,
              callback: value => formatPerformanceAxisValue(value, baseCurrency)
            }
          }
        }
      }
    });

    return () => {
      if (performanceChartRef.current) {
        performanceChartRef.current.destroy();
        performanceChartRef.current = null;
      }
    };
  }, [activePortfolio, stocks, chartMode, timeRange, mountTime, baseCurrency, fxRate, palette]);

  const handleRefreshPrices = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    const heldTickers = holdingsKeys.filter(t => (activePortfolio.holdings[t]?.shares || 0) > 0);
    const allPortfolioTickers = [...new Set(activePortfolio.transactions.map(t => t.ticker))];
    const tickersToRefresh = heldTickers.length > 0 ? heldTickers : allPortfolioTickers;

    if (tickersToRefresh.length === 0) {
      setIsRefreshing(false);
      showNotification('No transaction history to refresh', 'info');
      return;
    }

    try {
      await Promise.all(tickersToRefresh.map(async (t) => {
        if (onFetchPortfolioHistory) await onFetchPortfolioHistory(t);
        if (onRefreshPrices) await onRefreshPrices(t);
      }));
      showNotification('Chart history & live prices refreshed', 'success');
    } catch (err) {
      console.error('Refresh portfolio prices failed:', err);
      showNotification('Some prices could not be refreshed', 'warning');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSellAll = (ticker, shares, price) => {
    onPrefillTrade?.({
      ticker,
      type: 'SELL',
      shares,
      price,
      account: activePortfolio.name
    });
  };

  const handleReset = () => {
    const confirmReset = confirm(`Are you absolutely sure you want to reset "${activePortfolio.name}"?\nThis will liquidate all holdings and delete all transaction audit history for this portfolio.`);
    if (confirmReset) onResetPortfolio(activePortfolio.id);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => onImportCSV(evt.target.result);
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <section className="panel panel-portfolio-right portfolio-dashboard" aria-label="Portfolio Performance">
      <div className="portfolio-overview-heading">
        <span className="portfolio-eyebrow">ACCOUNT OVERVIEW</span>
        <details className="portfolio-data-menu" onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary').focus(); } }}>
          <summary>Manage data <span aria-hidden="true">⌄</span></summary>
          <div className="portfolio-data-actions">
            <button type="button" onClick={() => fileInputRef.current.click()}><i className="fa-solid fa-file-import" aria-hidden="true" />Import CSV</button>
            <button type="button" onClick={() => onExportCSV(activePortfolio.id)}><i className="fa-solid fa-file-export" aria-hidden="true" />Export CSV</button>
            <button type="button" className="portfolio-destructive" onClick={handleReset} id="btnResetPortfolio"><i className="fa-solid fa-trash-can" aria-hidden="true" />Reset portfolio</button>
          </div>
        </details>
        <input ref={fileInputRef} type="file" id="csvFileInput" accept=".csv" onChange={handleFileChange} hidden />
      </div>

      <div className="portfolio-balance-sheet">
        <div className="portfolio-balance"><span className="portfolio-field-label">Portfolio value <span className="portfolio-currency-label">{baseCurrency}</span></span><strong className="tabular-nums">{formatMoney(totalAssetValue, baseCurrency)}</strong><p>Invested capital <span className="tabular-nums">{formatMoney(totalCostBasis, baseCurrency)}</span></p></div>
        <div className="portfolio-return"><span className="portfolio-field-label">Total return</span><strong className={`tabular-nums ${totalReturnVal >= 0 ? 'text-green' : 'text-red'}`}>{totalReturnVal >= 0 ? '+' : ''}{totalReturnPct.toFixed(2)}%<span aria-hidden="true">{totalReturnVal >= 0 ? ' ↗' : ' ↘'}</span></strong><span className="tabular-nums">{totalReturnVal >= 0 ? '+' : ''}{formatMoney(totalReturnVal, baseCurrency)}</span><small>Capital gains + dividends</small></div>
        <dl className="portfolio-income-strip">
          <div><dt><span className="income-indicator open" aria-hidden="true" />Unrealized P&L</dt><dd className={`tabular-nums ${netProfit >= 0 ? 'text-green' : 'text-red'}`}>{netProfit >= 0 ? '+' : ''}{formatMoney(netProfit, baseCurrency)}</dd><dd className="portfolio-income-caption">{netReturnPct >= 0 ? '+' : ''}{netReturnPct.toFixed(2)}% on open positions</dd></div>
          <div><dt><span className="income-indicator closed" aria-hidden="true" />Realized P&L</dt><dd className={`tabular-nums ${realizedPL >= 0 ? 'text-green' : 'text-red'}`}>{realizedPL >= 0 ? '+' : ''}{formatMoney(realizedPL, baseCurrency)}</dd><dd className="portfolio-income-caption">From closed positions</dd></div>
          <div><dt><span className="income-indicator dividend" aria-hidden="true" />Dividend income</dt><dd className="tabular-nums">{formatMoney(totalDividends, baseCurrency)}</dd><dd className="portfolio-income-caption">After tax and fees</dd></div>
        </dl>
        <details className="portfolio-return-note"><summary>How your return is measured <span aria-hidden="true">⌄</span></summary><p>Total gains divided by all purchase costs, including fees and closed positions. Uses current USD/THB exchange rates. This cumulative return is not annualized or adjusted for cash-flow timing.</p></details>
      </div>

      <div className="portfolio-visuals-grid">
        <section className="portfolio-performance-card" aria-label="Performance chart">
          <header className="portfolio-card-heading"><div><h3>Performance</h3><p>{chartMode === 'total' ? 'Realized gains, open gains, and dividends' : 'Gains and losses on open positions'} · {baseCurrency}</p></div>
            {(activePortfolio?.transactions || []).length > 0 && <button type="button" onClick={handleRefreshPrices} disabled={isRefreshing} className="portfolio-icon-button" aria-label="Refresh chart prices" title="Refresh chart prices">↻</button>}
          </header>
          <div className="portfolio-performance-toolbar">
            <SegmentedControl label="Performance measure" value={chartMode} onChange={setChartMode} options={[{ value: 'total', label: 'Total P&L' }, { value: 'unrealized', label: 'Unrealized P&L' }]} />
            <SegmentedControl className="portfolio-range-control" label="Performance time range" value={timeRange} onChange={setTimeRange} options={['1W', '1M', '1Y', '5Y', 'ALL'].map(value => ({ value, label: value === 'ALL' ? 'All' : value }))} />
          </div>
          <div className="performance-chart-wrapper" id="performanceChartContainer">
            <canvas ref={performanceCanvasRef} id="portfolioPerformanceChart" role="img" aria-label={`${chartMode === 'total' ? 'Total' : 'Unrealized'} portfolio profit and loss in ${baseCurrency}`} />
            {(activePortfolio?.transactions || []).length === 0 && <div id="performanceEmptyMsg" className="empty-chart-overlay"><span aria-hidden="true">↗</span><strong>Your story starts here</strong><span>Record a transaction to begin tracking performance.</span></div>}
          </div>
          <p className="portfolio-chart-footnote">{chartMode === 'total' ? 'Total P&L includes dividend income.' : 'Unrealized P&L reflects open holdings.'} Values shown in {baseCurrency}.</p>
        </section>
        <AllocationDonut activePortfolio={activePortfolio} stocks={stocks} baseCurrency={baseCurrency} />
      </div>

      <div className="portfolio-details-heading"><SegmentedControl className="portfolio-section-picker" label="Portfolio details" value={portfolioSection} onChange={setPortfolioSection} options={[{ value: 'holdings', label: <>Holdings <span>{rawHoldings.length}</span></> }, { value: 'rebalance', label: 'Rebalance' }]} /><span className="portfolio-details-caption">{portfolioSection === 'holdings' ? 'The details behind your balance' : 'Bring your investments back to plan'}</span></div>
      <div hidden={portfolioSection !== 'holdings'}>
        <HoldingsList holdings={sortedHoldings} activePortfolio={activePortfolio} totalAssetValue={totalAssetValue} baseCurrency={baseCurrency} sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} onSellAll={handleSellAll} onRefresh={handleRefreshPrices} isRefreshing={isRefreshing} />
      </div>
      <div hidden={portfolioSection !== 'rebalance'} className="portfolio-rebalance-card">
        <div className="section-introduction"><h3>Keep your portfolio in balance</h3><p>Set target weights, plan a deposit, or review proposed orders.</p></div>
        <RebalanceStudio activePortfolio={activePortfolio} stocks={stocks} onUpdateTargetAllocations={onUpdateTargetAllocations} onExecuteRebalance={onExecuteRebalance} onPrefillTrade={onPrefillTrade} onAddTransaction={onAddTransaction} showNotification={showNotification} />
      </div>
    </section>
  );
}
