import React, { useState, useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

export default function PerformanceHoldings({
  portfolios,
  activePortfolioId,
  stocks,
  onAddTransaction,
  onDeleteTransaction,
  onResetPortfolio,
  onImportCSV,
  onExportCSV,
  onRefreshPrices,
  onFetchPortfolioHistory,
  showNotification
}) {
  const performanceCanvasRef = useRef(null);
  const performanceChartRef = useRef(null);
  const fileInputRef = useRef(null);

  // Sorting state for active holdings table
  const [sortColumn, setSortColumn] = useState('marketValue');
  const [sortDirection, setSortDirection] = useState('desc');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [chartMode, setChartMode] = useState('total'); // 'total' | 'unrealized'

  const activePortfolio = portfolios.find(p => p.id === activePortfolioId) || {
    id: 'default',
    name: 'Primary Portfolio',
    holdings: {},
    transactions: [],
    realizedPL: 0
  };

  // Format currency helper
  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
  };

  let totalAssetValue = 0;
  let totalCostBasis = 0;

  const holdingsKeys = Object.keys(activePortfolio.holdings || {});
  const rawHoldings = holdingsKeys
    .filter(ticker => (activePortfolio.holdings[ticker]?.shares || 0) > 0)
    .map(ticker => {
      const holding = activePortfolio.holdings[ticker];
      const stockMeta = stocks[ticker] || { price: holding.avgCost, name: `${ticker} Stock` };
      const stockPrice = stockMeta.price || holding.avgCost;
      const totalCost = (holding.shares * holding.avgCost) + (holding.totalFees || 0);
      const marketValue = holding.shares * stockPrice;
      const pnlVal = marketValue - totalCost;
      const pnlPct = totalCost > 0 ? (pnlVal / totalCost) * 100 : 0;

      totalAssetValue += marketValue;
      totalCostBasis += totalCost;

      return {
        ticker,
        name: stockMeta.name || `${ticker} Stock`,
        shares: holding.shares,
        avgCost: holding.avgCost,
        currentPrice: stockPrice,
        totalCost,
        marketValue,
        pnlVal,
        pnlPct
      };
    });

  const netProfit = totalAssetValue - totalCostBasis;
  const netReturnPct = totalCostBasis > 0 ? (netProfit / totalCostBasis) * 100 : 0;

  const sortedHoldings = [...rawHoldings].sort((a, b) => {
    let valA = a[sortColumn];
    let valB = b[sortColumn];

    if (valA === valB) return 0;
    if (typeof valA === 'string') {
      return sortDirection === 'asc'
        ? valA.localeCompare(valB)
        : valB.localeCompare(valA);
    } else {
      return sortDirection === 'asc' ? valA - valB : valB - valA;
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

    const txs = [...activePortfolio.transactions].sort((a, b) => a.timestamp - b.timestamp);
    if (txs.length === 0) return;

    let earliestActiveTimestamp = Infinity;
    txs.forEach(tx => {
      if (tx.type === 'BUY' && tx.timestamp < earliestActiveTimestamp) {
        earliestActiveTimestamp = tx.timestamp;
      }
    });

    if (earliestActiveTimestamp === Infinity) earliestActiveTimestamp = txs[0].timestamp;

    const startDate = new Date(earliestActiveTimestamp);
    const endDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);

    const diffDays = Math.ceil(Math.abs(endDate - startDate) / (1000 * 60 * 60 * 24));
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

    const getPriceOnDate = (ticker, targetDate, fallbackPrice) => {
      const stock = stocks[ticker];
      if (!stock) return fallbackPrice;

      const closes = stock.portfolioHistory || stock.liveCloses || [];
      const labels = stock.portfolioLabels || stock.liveLabels || [];
      const livePrice = parseFloat(stock.price) || 0;

      const parseLocalDate = (dateStr) => {
        const [y, m, d] = dateStr.split('-').map(Number);
        return new Date(y, m - 1, d);
      };

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

      while (txIdx < txs.length && txs[txIdx].timestamp <= endOfDayMs) {
        const tx = txs[txIdx];
        const ticker = tx.ticker;
        const txPrice = parseFloat(tx.price) || 0;
        const txShares = parseFloat(tx.shares) || 0;
        const txFees = parseFloat(tx.fees) || 0;

        if (tx.type === 'BUY') {
          if (!holdingsOnDate[ticker]) {
            holdingsOnDate[ticker] = { shares: 0, avgCost: 0, totalFees: 0, lastPrice: txPrice };
          }
          const h = holdingsOnDate[ticker];
          const newPureTotalCost = (h.shares * h.avgCost) + (txShares * txPrice);
          h.shares += txShares;
          h.avgCost = h.shares > 0 ? (newPureTotalCost / h.shares) : 0;
          h.totalFees = (h.totalFees || 0) + txFees;
          h.lastPrice = txPrice;
        } else {
          if (holdingsOnDate[ticker]) {
            const h = holdingsOnDate[ticker];
            const originalShares = h.shares;
            const saleRealizedGain = (txPrice - h.avgCost) * txShares - txFees;
            cumulativeRealizedPL += saleRealizedGain;

            h.shares = Math.max(0, h.shares - txShares);
            h.totalFees = originalShares > 0 ? (h.totalFees || 0) * (h.shares / originalShares) : 0;
            h.lastPrice = txPrice;
            if (h.shares < 1e-9) delete holdingsOnDate[ticker];
          }
        }
        txIdx++;
      }

      let unrealizedPLOnDate = 0;
      Object.keys(holdingsOnDate).forEach(t => {
        const h = holdingsOnDate[t];
        if (h.shares > 0) {
          const price = getPriceOnDate(t, D, h.lastPrice || h.avgCost || 0);
          const totalCostOnDate = (h.shares * h.avgCost) + (h.totalFees || 0);
          const marketValueOnDate = h.shares * price;
          unrealizedPLOnDate += marketValueOnDate - totalCostOnDate;
        }
      });

      const totalPLOnDate = cumulativeRealizedPL + unrealizedPLOnDate;
      points.push({
        x: D,
        y: chartMode === 'total' ? totalPLOnDate : unrealizedPLOnDate
      });
    });

    if (points.length === 1) {
      const prevDate = new Date(points[0].x.getTime() - 24 * 60 * 60 * 1000);
      points.unshift({ x: prevDate, y: 0 });
    }

    points.sort((a, b) => a.x.getTime() - b.x.getTime());
    const labels = points.map(p => p.x.toLocaleDateString([], { month: 'short', day: 'numeric' }));
    const data = points.map(p => parseFloat(p.y.toFixed(2)) || 0);

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
                return ` ${context.dataset.label}: ${sign}$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
              }
            }
          }
        },
        scales: {
          x: { grid: { color: 'rgba(255, 255, 255, 0.04)', drawBorder: false }, ticks: { color: '#64748B', font: { family: 'JetBrains Mono', size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
          y: { grid: { color: 'rgba(255, 255, 255, 0.04)', drawBorder: false }, ticks: { color: '#64748B', font: { family: 'JetBrains Mono', size: 10 }, callback: function (val) { const sign = val >= 0 ? '+' : ''; return `${sign}$${val.toLocaleString('en-US', { notation: 'compact' })}`; } } }
        }
      }
    });

    return () => {
      if (performanceChartRef.current) {
        performanceChartRef.current.destroy();
        performanceChartRef.current = null;
      }
    };
  }, [activePortfolio, stocks, chartMode]);

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

    await Promise.all(tickersToRefresh.map(async (t) => {
      if (onFetchPortfolioHistory) await onFetchPortfolioHistory(t);
      if (onRefreshPrices) await onRefreshPrices(t);
    }));
    setIsRefreshing(false);
    showNotification('Chart history & live prices refreshed', 'success');
  };

  const handleSellAll = (ticker, shares, price) => {
    onAddTransaction(activePortfolio.id, {
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

  const formattedDate = (timestamp) => {
    const txDate = new Date(timestamp);
    return txDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + txDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
            <i className="fa-solid fa-rotate-left"></i> <span>Reset</span>
          </button>
          <input ref={fileInputRef} type="file" id="csvFileInput" accept=".csv" onChange={handleFileChange} style={{ display: 'none' }} />
        </div>
      </div>

      <div className="analysis-cards-grid portfolio-kpi-grid">
        <div className="metric-card card-cyan">
          <div className="metric-card-header"><span className="title">Portfolio Net Worth</span><i className="fa-solid fa-vault text-cyan"></i></div>
          <div className="metric-val tabular-nums">{formatCurrency(totalAssetValue)}</div>
          <div className="metric-subtext tabular-nums">Invested Capital: {formatCurrency(totalCostBasis)}</div>
        </div>
        <div className={`metric-card ${netProfit >= 0 ? 'card-green' : 'card-red'}`}>
          <div className="metric-card-header"><span className="title">Unrealized P&L</span><i className={`fa-solid ${netProfit >= 0 ? 'fa-arrow-trend-up text-green' : 'fa-arrow-trend-down text-red'}`}></i></div>
          <div className={`metric-val tabular-nums ${netProfit >= 0 ? 'text-green' : 'text-red'}`}>{netProfit >= 0 ? '+' : ''}{formatCurrency(netProfit)}</div>
          <div className="metric-subtext tabular-nums">Open Returns: {netProfit >= 0 ? '+' : ''}{netReturnPct.toFixed(2)}%</div>
        </div>
        <div className={`metric-card ${activePortfolio.realizedPL >= 0 ? 'card-green' : 'card-red'}`}>
          <div className="metric-card-header"><span className="title">Realized P&L</span><i className="fa-solid fa-sack-dollar text-cyan"></i></div>
          <div className={`metric-val tabular-nums ${activePortfolio.realizedPL >= 0 ? 'text-green' : 'text-red'}`}>{activePortfolio.realizedPL >= 0 ? '+' : ''}{formatCurrency(activePortfolio.realizedPL)}</div>
          <div className="metric-subtext">Profit/loss closed from asset sales</div>
        </div>
        <div className="metric-card card-cyan">
          <div className="metric-card-header"><span className="title">Total Return (ROI)</span><i className="fa-solid fa-percent text-cyan"></i></div>
          <div className={`metric-val tabular-nums ${netProfit >= 0 ? 'text-green' : 'text-red'}`}>{netProfit >= 0 ? '+' : ''}{netReturnPct.toFixed(2)}%</div>
          <div className="metric-subtext">{rawHoldings.length} Active Positions Held</div>
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
          {activePortfolio.transactions.length > 0 && (
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
        <div className="performance-chart-wrapper" id="performanceChartContainer">
          <canvas ref={performanceCanvasRef} id="portfolioPerformanceChart"></canvas>
          {activePortfolio.transactions.length === 0 && (
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
                {sortedHoldings.map(h => {
                  const weight = totalAssetValue > 0 ? (h.marketValue / totalAssetValue) * 100 : 0;
                  return (
                    <tr key={h.ticker}>
                      <td className="cell-asset">
                        <div className="asset-cell-flex"><span className="asset-ticker">{h.ticker}</span><span className="asset-name">{h.name}</span></div>
                      </td>
                      <td className="tabular-nums font-bold">{parseFloat(h.shares.toFixed(6))}</td>
                      <td className="tabular-nums">{formatCurrency(h.avgCost)}</td>
                      <td className="tabular-nums font-bold text-white">{formatCurrency(h.currentPrice)}</td>
                      <td className="tabular-nums">{formatCurrency(h.totalCost)}</td>
                      <td className="tabular-nums font-bold text-cyan">{formatCurrency(h.marketValue)}</td>
                      <td className="tabular-nums font-bold">
                        <span className={h.pnlVal >= 0 ? 'text-green' : 'text-red'}>{h.pnlVal >= 0 ? '+' : ''}{formatCurrency(h.pnlVal)}</span>
                        <span className={`cell-pct-sub ${h.pnlVal >= 0 ? 'text-green' : 'text-red'}`}>({h.pnlVal >= 0 ? '+' : ''}{h.pnlPct.toFixed(2)}%)</span>
                      </td>
                      <td className="cell-weight">
                        <div className="table-weight-wrapper">
                          <span className="weight-num tabular-nums">{weight.toFixed(1)}%</span>
                          <div className="weight-track"><div className="weight-fill" style={{ width: `${weight}%` }}></div></div>
                        </div>
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

      <div className="analysis-section transaction-ledger-section">
        <div className="section-subtitle">
          <span>Transaction Audit History</span>
          <span className="ledger-count-tag tabular-nums">{activePortfolio.transactions.length} Records</span>
        </div>
        <div className="ledger-scroll-viewport">
          <ul className="ledger-list" id="portfolioLogList">
            {activePortfolio.transactions.length === 0 ? (
              <li className="empty-pill-msg" style={{ textAlign: 'center', paddingTop: '15px' }}>No transaction audit records found.</li>
            ) : (
              [...activePortfolio.transactions].reverse().map((tx, idx) => {
                const actualIndex = activePortfolio.transactions.length - 1 - idx;
                const gross = tx.shares * tx.price;
                const txFees = parseFloat(tx.fees) || 0;
                const net = tx.type === 'BUY' ? (gross + txFees) : Math.max(0, gross - txFees);
                const accountStr = tx.account && tx.account !== 'Default' ? ` • ${tx.account}` : '';
                return (
                  <li key={`tx-log-${actualIndex}`} className="tx-ledger-item">
                    <div className="ledger-left">
                      <div className="ledger-top-row">
                        <span className={`type-badge ${tx.type.toLowerCase()}`}>{tx.type}</span>
                        <span className="ledger-shares-ticker tabular-nums"><strong>{parseFloat(tx.shares.toFixed(6))} {tx.ticker}</strong> @ {formatCurrency(tx.price)}</span>
                      </div>
                      <div className="ledger-meta-row tabular-nums">
                        <span>Gross: {formatCurrency(gross)}</span><span>Fee: {formatCurrency(txFees)}</span><span>Net: <strong>{formatCurrency(net)}</strong></span>{accountStr && <span className="account-tag">{accountStr}</span>}
                      </div>
                    </div>
                    <div className="ledger-right">
                      <span className="tx-time tabular-nums">{formattedDate(tx.timestamp)}</span>
                      <button type="button" onClick={() => { const confirmDelete = confirm("Do you want to delete this transaction entry? This will revert its effect on your holdings."); if (confirmDelete) onDeleteTransaction(activePortfolio.id, actualIndex); }} className="btn-tx-delete" title="Delete transaction entry" aria-label="Delete transaction entry"><i className="fa-solid fa-trash-can"></i></button>
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      </div>
    </section>
  );
}
