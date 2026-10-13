import { investedCapital } from '../utils/portfolioLedger.js';
import { useState, useEffect, useRef, useMemo } from 'react';
import { Chart, registerables } from 'chart.js';
import RebalanceStudio from './RebalanceStudio';
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
  const performanceCanvasRef = useRef(null);
  const performanceChartRef = useRef(null);
  const fileInputRef = useRef(null);
  const [mountTime] = useState(() => Date.now());

  // Sorting state for active holdings table
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

  const renderSortIcon = (col) => {
    if (sortColumn !== col) return <i className="fa-solid fa-sort sort-icon-muted"></i>;
    return sortDirection === 'asc'
      ? <i className="fa-solid fa-sort-up sort-icon-active"></i>
      : <i className="fa-solid fa-sort-down sort-icon-active"></i>;
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
    const accentColor = isOverallGain ? '#10B981' : '#F43F5E';

    const gradient = ctx.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, isOverallGain ? 'rgba(16, 185, 129, 0.25)' : 'rgba(244, 63, 94, 0.25)');
    gradient.addColorStop(1, 'rgba(13, 19, 33, 0)');

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
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            displayColors: false,
            backgroundColor: '#060912',
            titleColor: '#06B6D4',
            bodyColor: '#ffffff',
            borderColor: 'rgba(255, 255, 255, 0.12)',
            borderWidth: 1,
            titleFont: { family: 'Outfit', weight: '700', size: 12 },
            bodyFont: { family: 'JetBrains Mono', size: 11 },
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
          x: { grid: { color: 'rgba(255, 255, 255, 0.04)', drawBorder: false }, ticks: { color: '#64748B', font: { family: 'JetBrains Mono', size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
          y: { grid: { color: 'rgba(255, 255, 255, 0.04)', drawBorder: false }, ticks: { color: '#64748B', font: { family: 'JetBrains Mono', size: 10 }, callback: function (val) { const sign = val >= 0 ? '+' : '-'; const sym = baseCurrency === 'THB' ? '฿' : '$'; return `${sign}${sym}${Math.abs(val).toLocaleString('en-US', { notation: 'compact' })}`; } } }
        }
      }
    });

    return () => {
      if (performanceChartRef.current) {
        performanceChartRef.current.destroy();
        performanceChartRef.current = null;
      }
    };
  }, [activePortfolio, stocks, chartMode, timeRange, mountTime, baseCurrency, fxRate]);

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
    onAddTransaction(activePortfolio.id, {
      // eslint-disable-next-line react-hooks/purity
      timestamp: Date.now(),
      ticker,
      type: 'SELL',
      shares,
      price,
      fees: 0,
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
    <section className="panel panel-portfolio-right" aria-label="Portfolio Performance">
      <div className="panel-header portfolio-right-header">
        <h2 className="panel-title">
          <i className="fa-solid fa-wallet"></i> Performance & Holdings
        </h2>
        <div className="portfolio-header-tools">
          <button type="button" onClick={() => fileInputRef.current.click()} className="btn-tool btn-csv-import" title="Import transactions from CSV">
            <i className="fa-solid fa-file-import"></i> <span>Import CSV</span>
          </button>
          <button type="button" onClick={() => onExportCSV(activePortfolio.id)} className="btn-tool btn-csv-export" title="Export transactions as CSV">
            <i className="fa-solid fa-file-export"></i> <span>Export CSV</span>
          </button>
          <button type="button" onClick={handleReset} className="btn-tool btn-portfolio-reset" id="btnResetPortfolio" title="Reset Portfolio">
            <i className="fa-solid fa-trash-can"></i> <span>Reset</span>
          </button>
          <input ref={fileInputRef} type="file" id="csvFileInput" accept=".csv" onChange={handleFileChange} style={{ display: 'none' }} />
        </div>
      </div>

      <div className="analysis-cards-grid portfolio-kpi-grid">
        <div className="metric-card card-cyan">
          <div className="metric-card-header"><span className="title">Portfolio Net Worth</span><i className="fa-solid fa-vault text-cyan"></i></div>
          <div className="metric-val tabular-nums">{formatMoney(totalAssetValue, baseCurrency)}</div>
          <div className="metric-subtext tabular-nums">Invested Capital: {formatMoney(totalCostBasis, baseCurrency)}</div>
        </div>
        <div className={`metric-card ${netProfit >= 0 ? 'card-green' : 'card-red'}`}>
          <div className="metric-card-header"><span className="title">Unrealized P&L</span><i className={`fa-solid ${netProfit >= 0 ? 'fa-arrow-trend-up text-green' : 'fa-arrow-trend-down text-red'}`}></i></div>
          <div className={`metric-val tabular-nums ${netProfit >= 0 ? 'text-green' : 'text-red'}`}>
            {netProfit >= 0 ? '+' : ''}{formatMoney(netProfit, baseCurrency)} ({netProfit >= 0 ? '+' : ''}{netReturnPct.toFixed(2)}%)
          </div>
          <div className="metric-subtext">Open positions return on cost</div>
        </div>
        <div className={`metric-card ${realizedPL >= 0 ? 'card-green' : 'card-red'}`}>
          <div className="metric-card-header"><span className="title">Realized P&L</span><i className="fa-solid fa-sack-dollar text-cyan"></i></div>
          <div className={`metric-val tabular-nums ${realizedPL >= 0 ? 'text-green' : 'text-red'}`}>{realizedPL >= 0 ? '+' : ''}{formatMoney(realizedPL, baseCurrency)}</div>
          <div className="metric-subtext">Profit/loss closed from asset sales</div>
        </div>
        <div className="metric-card card-purple">
          <div className="metric-card-header"><span className="title">Dividend Income</span><i className="fa-solid fa-hand-holding-dollar text-purple"></i></div>
          <div className="metric-val tabular-nums text-purple">+{formatMoney(totalDividends, baseCurrency)}</div>
          <div className="metric-subtext">Cumulative cash payouts received</div>
        </div>
        <div className={`metric-card ${totalReturnVal >= 0 ? 'card-green' : 'card-red'}`}>
          <div className="metric-card-header"><span className="title" title="Total gains divided by all purchase costs, including closed positions. Uses current FX; not annualized or cash-flow adjusted.">Total Return (ROI)</span><i className="fa-solid fa-percent text-cyan"></i></div>
          <div className={`metric-val tabular-nums ${totalReturnVal >= 0 ? 'text-green' : 'text-red'}`}>{totalReturnVal >= 0 ? '+' : ''}{formatMoney(totalReturnVal, baseCurrency)} ({totalReturnVal >= 0 ? '+' : ''}{totalReturnPct.toFixed(2)}%)</div>
          <div className="metric-subtext">Capital gains + dividend payouts</div>
        </div>
      </div>

      <div className="analysis-section portfolio-chart-section">
        <div className="section-subtitle portfolio-chart-subtitle">
          <div className="chart-mode-cluster">
            <span>Portfolio Valuation Progression</span>
            <div className="chart-mode-pill-group">
              <button type="button" onClick={() => setChartMode('total')} className={`chart-mode-pill ${chartMode === 'total' ? 'active' : ''}`}>Total P&L</button>
              <button type="button" onClick={() => setChartMode('unrealized')} className={`chart-mode-pill ${chartMode === 'unrealized' ? 'active' : ''}`}>Unrealized P&L</button>
            </div>
          </div>

          <div className="chart-right-controls">
            <div className="time-range-pill-group">
              {['1W', '1M', '1Y', '5Y', 'ALL'].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setTimeRange(r)}
                  className={`time-range-pill ${timeRange === r ? 'active' : ''}`}
                >
                  {r}
                </button>
              ))}
            </div>
            {(activePortfolio?.transactions || []).length > 0 && (
              <button
                type="button"
                onClick={handleRefreshPrices}
                disabled={isRefreshing}
                className="btn-refresh"
                title="Refresh chart prices"
                aria-label="Refresh chart prices"
              >
                <i className={`fa-solid fa-arrows-rotate ${isRefreshing ? 'fa-spin' : ''}`}></i>
              </button>
            )}
          </div>
        </div>

        <div className="performance-chart-wrapper" id="performanceChartContainer">
          <canvas ref={performanceCanvasRef} id="portfolioPerformanceChart"></canvas>
          {(activePortfolio?.transactions || []).length === 0 && (
            <div id="performanceEmptyMsg" className="empty-chart-overlay">
              <i className="fa-solid fa-chart-line empty-chart-icon"></i> <span>No performance history available yet. Record transactions to plot growth.</span>
            </div>
          )}
        </div>
      </div>

      <div className="analysis-section holdings-table-section">
        <div className="section-subtitle holdings-header-subtitle">
          <div className="holdings-title-left">
            <span>Active Asset Holdings</span>
            <span className="holdings-count-badge tabular-nums">{rawHoldings.length} {rawHoldings.length === 1 ? 'Holding' : 'Holdings'}</span>
          </div>
          {rawHoldings.length > 0 && (
            <button
              type="button"
              onClick={handleRefreshPrices}
              disabled={isRefreshing}
              className="btn-refresh"
              title="Refresh stock prices"
              aria-label="Refresh stock prices"
            >
              <i className={`fa-solid fa-arrows-rotate ${isRefreshing ? 'fa-spin' : ''}`}></i>
            </button>
          )}
        </div>
        <div className="projection-table-wrapper holdings-table-scroller">
          {sortedHoldings.length === 0 ? (
            <div className="empty-table-state" id="emptyPortfolioState">
              <div className="empty-icon"><i className="fa-solid fa-briefcase"></i></div>
              <p className="empty-title">Your Portfolio is Empty</p>
              <p className="empty-desc">Search for a ticker and record a BUY transaction in the left panel to build your portfolio holdings.</p>
            </div>
          ) : (
            <table className="projection-table holdings-table" id="portfolioTable">
              <thead>
                <tr>
                  <th onClick={() => handleSort('ticker')} className="sortable">Asset {renderSortIcon('ticker')}</th>
                  <th onClick={() => handleSort('shares')} className="sortable">Shares {renderSortIcon('shares')}</th>
                  <th onClick={() => handleSort('avgCost')} className="sortable">Avg Cost {renderSortIcon('avgCost')}</th>
                  <th onClick={() => handleSort('currentPrice')} className="sortable">Market Price {renderSortIcon('currentPrice')}</th>
                  <th onClick={() => handleSort('totalCost')} className="sortable">Total Cost {renderSortIcon('totalCost')}</th>
                  <th onClick={() => handleSort('marketValue')} className="sortable">Market Value {renderSortIcon('marketValue')}</th>
                  <th onClick={() => handleSort('pnlVal')} className="sortable">Unrealized P&L {renderSortIcon('pnlVal')}</th>
                  <th style={{ textAlign: 'center', width: '90px' }}>Weight</th>
                  <th style={{ width: '80px', textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {sortedHoldings.map((h) => {
                  const weight = totalAssetValue > 0 ? (h.baseMarketValue / totalAssetValue) * 100 : 0;
                  const tickerDividends = (activePortfolio.dividendsByTicker?.[h.ticker] || activePortfolio.holdings?.[h.ticker]?.totalDividends || 0);
                  return (
                    <tr key={h.ticker}>
                      <td className="cell-asset">
                        <div className="asset-cell-flex">
                          <span className="asset-ticker">{h.ticker}</span>
                          <span className="asset-name">{h.name}</span>
                          {tickerDividends > 0 && (
                            <span className="holding-dividend-badge" title={`Cumulative dividend payouts received for ${h.ticker}`}>
                              <i className="fa-solid fa-hand-holding-dollar"></i> +{formatMoney(tickerDividends, h.currency)} div
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="tabular-nums font-bold">{parseFloat(Number(h.shares || 0).toFixed(6))}</td>
                      <td className="tabular-nums">{formatMoney(h.avgCost, h.currency)}</td>
                      <td className="tabular-nums font-bold text-white">{formatMoney(h.currentPrice, h.currency)}</td>
                      <td className="tabular-nums">{formatMoney(h.totalCost, h.currency)}</td>
                      <td className="tabular-nums font-bold text-cyan">{formatMoney(h.baseMarketValue, baseCurrency)}</td>
                      <td className="tabular-nums font-bold">
                        <span className={h.basePnlVal >= 0 ? 'text-green' : 'text-red'}>{h.basePnlVal >= 0 ? '+' : ''}{formatMoney(h.basePnlVal, baseCurrency)}</span>
                        <span className={`cell-pct-sub ${h.basePnlVal >= 0 ? 'text-green' : 'text-red'}`}>({h.basePnlVal >= 0 ? '+' : ''}{h.pnlPct.toFixed(2)}%)</span>
                      </td>
                      <td className="cell-weight">
                        {(() => {
                          const targetPct = parseFloat(activePortfolio.targetAllocations?.[h.ticker]) || 0;
                          const drift = weight - targetPct;
                          return (
                            <div className="table-weight-wrapper">
                              <div className="weight-val-row">
                                <span className="weight-num tabular-nums">{weight.toFixed(1)}%</span>
                                {targetPct > 0 && (
                                  <span
                                    className={`table-target-tag tabular-nums ${
                                      Math.abs(drift) <= 0.5 ? 'balanced' : drift > 0 ? 'overweight' : 'underweight'
                                    }`}
                                    title={`Target: ${targetPct.toFixed(1)}% (Drift: ${drift > 0 ? '+' : ''}${drift.toFixed(1)}%)`}
                                  >
                                    Tgt {targetPct.toFixed(1)}% ({drift > 0 ? '+' : ''}${drift.toFixed(1)}%)
                                  </span>
                                )}
                              </div>
                              <div className="weight-track">
                                <div className="weight-fill" style={{ width: `${Math.min(100, weight)}%` }}></div>
                                {targetPct > 0 && (
                                  <div
                                    className="target-marker-line"
                                    style={{ left: `${Math.min(100, targetPct)}%` }}
                                    title={`Target: ${targetPct.toFixed(1)}%`}
                                  ></div>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button type="button" onClick={() => handleSellAll(h.ticker, h.shares, h.currentPrice)} className="btn-sell-all-row" title={`Liquidate all ${h.ticker} shares`}>Sell All</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="analysis-section rebalance-main-section">
        <RebalanceStudio
          activePortfolio={activePortfolio}
          stocks={stocks}
          onUpdateTargetAllocations={onUpdateTargetAllocations}
          onExecuteRebalance={onExecuteRebalance}
          onPrefillTrade={onPrefillTrade}
          onAddTransaction={onAddTransaction}
          showNotification={showNotification}
        />
      </div>
    </section>
  );
}
