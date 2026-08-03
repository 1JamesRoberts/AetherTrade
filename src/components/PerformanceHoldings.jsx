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
  showNotification
}) {
  const performanceCanvasRef = useRef(null);
  const performanceChartRef = useRef(null);
  const fileInputRef = useRef(null);

  // Sorting state for active holdings table
  const [sortColumn, setSortColumn] = useState('marketValue');
  const [sortDirection, setSortDirection] = useState('desc');
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  // Calculate values
  let totalAssetValue = 0;
  let totalCostBasis = 0;

  const holdingsKeys = Object.keys(activePortfolio.holdings || {});
  const rawHoldings = holdingsKeys.map(ticker => {
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

  // Sorting logic
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
    if (sortColumn !== col) return <i className="fa-solid fa-sort"></i>;
    return sortDirection === 'asc' ? <i className="fa-solid fa-sort-up"></i> : <i className="fa-solid fa-sort-down"></i>;
  };

  // Reconstruct performance curve over time using transaction audit logs
  useEffect(() => {
    if (!performanceCanvasRef.current) return;

    if (performanceChartRef.current) {
      performanceChartRef.current.destroy();
      performanceChartRef.current = null;
    }

    const txs = [...activePortfolio.transactions];
    if (holdingsListLength() === 0) {
      return;
    }

    // Earliest BUY transaction marks inception
    let earliestActiveTimestamp = Infinity;
    txs.forEach(tx => {
      if (tx.type === 'BUY') {
        if (tx.timestamp < earliestActiveTimestamp) {
          earliestActiveTimestamp = tx.timestamp;
        }
      }
    });

    if (earliestActiveTimestamp === Infinity) {
      earliestActiveTimestamp = txs[0] ? txs[0].timestamp : Date.now();
    }

    const startDate = new Date(earliestActiveTimestamp);
    const endDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);

    if (startDate > endDate) {
      startDate.setTime(endDate.getTime());
    }

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

        if (compareDate.getTime() === today.getTime() && livePrice > 0) {
          return livePrice;
        }

        let exactIndex = -1;
        labels.forEach((label, idx) => {
          const parts = label.split('-');
          if (parts.length === 3) {
            const labelDate = parseLocalDate(label);
            if (labelDate.getTime() === compareDate.getTime()) {
              exactIndex = idx;
            }
          }
        });
        if (exactIndex !== -1) {
          const p = parseFloat(closes[exactIndex]);
          return (p && !isNaN(p) && p > 0) ? p : fallbackPrice;
        }

        let bestIdx = -1;
        let bestDiff = Infinity;
        labels.forEach((label, idx) => {
          const parts = label.split('-');
          if (parts.length === 3) {
            const labelDate = parseLocalDate(label);
            const diff = compareDate.getTime() - labelDate.getTime();
            if (diff >= 0 && diff < bestDiff) {
              bestDiff = diff;
              bestIdx = idx;
            }
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
    timelineDates.forEach(D => {
      const holdingsOnDate = {};
      const lastPriceOnDate = {};

      txs.forEach(tx => {
        if (tx.timestamp <= D.getTime() + 86399999) {
          const ticker = tx.ticker;
          const txPrice = parseFloat(tx.price) || 0;
          const txShares = parseFloat(tx.shares) || 0;
          const txFees = parseFloat(tx.fees) || 0;

          lastPriceOnDate[ticker] = txPrice;

          if (tx.type === 'BUY') {
            if (!holdingsOnDate[ticker]) {
              holdingsOnDate[ticker] = { shares: 0, avgCost: 0, totalFees: 0 };
            }
            const h = holdingsOnDate[ticker];
            const newPureTotalCost = (h.shares * h.avgCost) + (txShares * txPrice);
            h.shares += txShares;
            h.avgCost = h.shares > 0 ? (newPureTotalCost / h.shares) : 0;
            h.totalFees = (h.totalFees || 0) + txFees;
          } else {
            if (holdingsOnDate[ticker]) {
              const h = holdingsOnDate[ticker];
              const originalShares = h.shares;
              h.shares = Math.max(0, h.shares - txShares);
              
              if (originalShares > 0) {
                h.totalFees = (h.totalFees || 0) * (h.shares / originalShares);
              } else {
                h.totalFees = 0;
              }

              if (h.shares < 1e-9) {
                delete holdingsOnDate[ticker];
              }
            }
          }
        }
      });

      let unrealizedPLOnDate = 0;
      Object.keys(holdingsOnDate).forEach(t => {
        const h = holdingsOnDate[t];
        if (h.shares > 0) {
          const price = getPriceOnDate(t, D, lastPriceOnDate[t] || h.avgCost || 0);
          const totalCostOnDate = (h.shares * h.avgCost) + (h.totalFees || 0);
          const marketValueOnDate = h.shares * price;
          unrealizedPLOnDate += marketValueOnDate - totalCostOnDate;
        }
      });

      points.push({ x: D, y: unrealizedPLOnDate });
    });

    if (points.length === 1) {
      const prevDate = new Date(points[0].x.getTime() - 24 * 60 * 60 * 1000);
      points.unshift({ x: prevDate, y: 0 });
    }

    points.sort((a, b) => a.x.getTime() - b.x.getTime());
    const labels = points.map(p => p.x.toLocaleDateString([], { month: 'short', day: 'numeric' }));
    const data = points.map(p => parseFloat(p.y.toFixed(2)) || 0);

    const ctx = performanceCanvasRef.current.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 150);
    gradient.addColorStop(0, 'rgba(0, 229, 255, 0.15)');
    gradient.addColorStop(1, 'rgba(2, 4, 10, 0)');

    performanceChartRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Unrealized P&L',
          data: data,
          borderColor: '#00e5ff',
          borderWidth: 2,
          pointBackgroundColor: '#00e5ff',
          pointBorderColor: 'rgba(2, 4, 10, 0.85)',
          pointBorderWidth: 1.5,
          pointRadius: 0,
          pointHoverRadius: 8,
          pointHoverBackgroundColor: '#00e5ff',
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 2.5,
          pointHitRadius: 10,
          fill: true,
          backgroundColor: gradient,
          tension: 0.2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: { right: 90 }
        },
        interaction: {
          mode: 'index',
          intersect: false,
        },
        scales: {
          x: {
            display: true,
            grid: { display: false, drawBorder: false },
            ticks: {
              color: '#94a3b8',
              font: { family: 'Plus Jakarta Sans', size: 9, weight: '500' },
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 5
            }
          },
          y: {
            position: 'right',
            grid: {
              color: (context) => (context.tick && context.tick.value === 0) ? 'rgba(0, 229, 255, 0.35)' : 'rgba(255, 255, 255, 0.02)',
              borderDash: (context) => (context.tick && context.tick.value === 0) ? [5, 5] : [],
              drawBorder: false
            },
            ticks: {
              color: '#94a3b8',
              font: { family: 'JetBrains Mono', size: 9, weight: '500' },
              callback: (value) => value >= 0 ? '+$' + value.toLocaleString() : '-$' + Math.abs(value).toLocaleString()
            }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#060912',
            titleColor: '#00e5ff',
            bodyColor: '#fff',
            borderColor: 'rgba(255, 255, 255, 0.06)',
            borderWidth: 1,
            titleFont: { family: 'Outfit', weight: '700', size: 11 },
            bodyFont: { family: 'JetBrains Mono', size: 11 },
            padding: 8,
            cornerRadius: 6,
            displayColors: false,
            callbacks: {
              title: (context) => {
                const idx = context[0].dataIndex;
                return points[idx].x.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
              },
              label: (context) => {
                const val = context.parsed.y;
                return val >= 0 ? ` Unrealized P&L: +$${val.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : ` Unrealized P&L: -$${Math.abs(val).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
              }
            }
          }
        }
      },
      plugins: [{
        id: 'zeroLinePlugin',
        afterDraw: (chart) => {
          const { ctx, scales: { y }, chartArea: { left, right, top, bottom } } = chart;
          if (!y) return;

          const zeroY = y.getPixelForValue(0);
          if (zeroY >= top && zeroY <= bottom) {
            ctx.save();
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(0, 240, 255, 0.3)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([5, 5]);
            ctx.moveTo(left, zeroY);
            ctx.lineTo(right, zeroY);
            ctx.stroke();
            ctx.restore();
          }

          const dataset = chart.data.datasets[0];
          if (dataset && dataset.data && dataset.data.length > 0) {
            const currentPL = dataset.data[dataset.data.length - 1];
            const currentPLY = y.getPixelForValue(currentPL);

            if (currentPLY >= top && currentPLY <= bottom) {
              ctx.save();
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
              ctx.lineWidth = 1;
              ctx.setLineDash([3, 3]);
              ctx.beginPath();
              ctx.moveTo(left, currentPLY);
              ctx.lineTo(right, currentPLY);
              ctx.stroke();

              const isGain = currentPL >= 0;
              ctx.fillStyle = isGain ? 'rgba(16, 185, 129, 0.9)' : 'rgba(244, 63, 94, 0.9)';
              ctx.beginPath();
              ctx.roundRect(right + 5, currentPLY - 10, 80, 20, 4);
              ctx.fill();

              ctx.fillStyle = '#ffffff';
              ctx.font = '700 9px var(--font-display)';
              const formattedPL = `${isGain ? '+' : '-'}$${Math.abs(currentPL).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
              ctx.fillText(`NOW: ${formattedPL}`, right + 10, currentPLY + 4);
              ctx.restore();
            }
          }
        }
      }]
    });

    return () => {
      if (performanceChartRef.current) {
        performanceChartRef.current.destroy();
        performanceChartRef.current = null;
      }
    };
  }, [activePortfolio, stocks]);

  const holdingsListLength = () => {
    return holdingsKeys.filter(t => activePortfolio.holdings[t].shares > 0).length;
  };

  const handleRefreshPrices = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    const heldTickers = holdingsKeys.filter(t => activePortfolio.holdings[t].shares > 0);
    await Promise.all(heldTickers.map(t => onRefreshPrices(t)));
    setIsRefreshing(false);
    showNotification('Stock prices refreshed', 'success');
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
    if (confirmReset) {
      onResetPortfolio(activePortfolio.id);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      onImportCSV(evt.target.result);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const formattedDate = (timestamp) => {
    const txDate = new Date(timestamp);
    const isMidnight = txDate.getHours() === 0 && txDate.getMinutes() === 0 && txDate.getSeconds() === 0 && txDate.getMilliseconds() === 0;
    return isMidnight
      ? txDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
      : txDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + txDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <section className="panel panel-portfolio-right" aria-label="Portfolio Performance" style={{ height: '100%', overflowY: 'auto' }}>
      <div className="panel-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <h2 className="panel-title" style={{ margin: 0 }}>
          <i className="fa-solid fa-wallet"></i> Performance & Holdings
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={() => fileInputRef.current.click()} className="btn" title="Import transactions from CSV" style={{ padding: '4px 10px', fontSize: '11px', margin: 0, display: 'inline-flex', height: 'auto', background: 'rgba(0, 240, 255, 0.1)', border: '1px solid rgba(0, 240, 255, 0.3)', color: 'var(--cyan)', boxShadow: '0 0 8px rgba(0, 240, 255, 0.05)', transition: 'all var(--transition-fast) ease', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <i className="fa-solid fa-file-import"></i> Import CSV
          </button>
          <button onClick={() => onExportCSV(activePortfolio.id)} className="btn" title="Export transactions as CSV" style={{ padding: '4px 10px', fontSize: '11px', margin: 0, display: 'inline-flex', height: 'auto', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', color: 'var(--bullish)', boxShadow: '0 0 8px rgba(16, 185, 129, 0.05)', transition: 'all var(--transition-fast) ease', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <i className="fa-solid fa-file-export"></i> Export CSV
          </button>
          <button onClick={handleReset} className="btn btn-clear-lines" id="btnResetPortfolio" style={{ padding: '4px 10px', fontSize: '11px', margin: 0, display: 'inline-flex', height: 'auto', gap: '6px' }}>
            <i className="fa-solid fa-rotate-left"></i> Reset Portfolio
          </button>
          <input
            ref={fileInputRef}
            type="file"
            id="csvFileInput"
            accept=".csv"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="analysis-cards-grid" style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', gap: '16px' }}>
        <div className="metric-card card-cyan">
          <div className="metric-card-header">
            <span className="title">Portfolio Market Value</span>
            <i className="fa-solid fa-briefcase text-cyan"></i>
          </div>
          <div className="metric-val">{formatCurrency(totalAssetValue)}</div>
          <div className="metric-subtext">Current market value of active assets</div>
        </div>

        <div className="metric-card card-green" style={{ borderColor: 'rgba(255, 255, 255, 0.05)', background: 'rgba(255, 255, 255, 0.01)' }}>
          <div className="metric-card-header">
            <span className="title">Invested Capital</span>
            <i className="fa-solid fa-vault text-cyan"></i>
          </div>
          <div className="metric-val" style={{ color: '#fff' }}>{formatCurrency(totalCostBasis)}</div>
          <div className="metric-subtext">Total cost basis of active assets</div>
        </div>

        <div
          className="metric-card card-cyan"
          style={{
            borderColor: netProfit > 0 ? 'rgba(16, 185, 129, 0.3)' : netProfit < 0 ? 'rgba(244, 63, 94, 0.3)' : 'var(--border-color)',
            background: netProfit > 0 ? 'rgba(16, 185, 129, 0.01)' : netProfit < 0 ? 'rgba(244, 63, 94, 0.01)' : 'rgba(255, 255, 255, 0.02)'
          }}
        >
          <div className="metric-card-header">
            <span className="title">Total Profit / Loss</span>
            <i className="fa-solid fa-money-bill-trend-up text-cyan"></i>
          </div>
          <div className={`metric-val ${netProfit > 0 ? 'text-green' : netProfit < 0 ? 'text-red' : ''}`}>
            {netProfit >= 0 ? '+' : ''}{formatCurrency(netProfit)}
          </div>
          <div className="metric-subtext">Unrealized returns in US dollars</div>
        </div>

        <div
          className="metric-card card-cyan"
          style={{
            borderColor: activePortfolio.realizedPL > 0 ? 'rgba(16, 185, 129, 0.3)' : activePortfolio.realizedPL < 0 ? 'rgba(244, 63, 94, 0.3)' : 'var(--border-color)',
            background: activePortfolio.realizedPL > 0 ? 'rgba(16, 185, 129, 0.01)' : activePortfolio.realizedPL < 0 ? 'rgba(244, 63, 94, 0.01)' : 'rgba(255, 255, 255, 0.02)'
          }}
        >
          <div className="metric-card-header">
            <span className="title">Realized Profit / Loss</span>
            <i className="fa-solid fa-wallet text-cyan"></i>
          </div>
          <div className={`metric-val ${activePortfolio.realizedPL > 0 ? 'text-green' : activePortfolio.realizedPL < 0 ? 'text-red' : ''}`}>
            {activePortfolio.realizedPL >= 0 ? '+' : ''}{formatCurrency(activePortfolio.realizedPL)}
          </div>
          <div className="metric-subtext">Profit/loss realized from asset sales</div>
        </div>

        <div
          className="metric-card card-cyan"
          style={{
            borderColor: netProfit > 0 ? 'rgba(16, 185, 129, 0.3)' : netProfit < 0 ? 'rgba(244, 63, 94, 0.3)' : 'var(--border-color)',
            background: netProfit > 0 ? 'rgba(16, 185, 129, 0.01)' : netProfit < 0 ? 'rgba(244, 63, 94, 0.01)' : 'rgba(255, 255, 255, 0.02)'
          }}
        >
          <div className="metric-card-header">
            <span className="title">Total Return Rate</span>
            <i className="fa-solid fa-percent text-cyan"></i>
          </div>
          <div className={`metric-val ${netProfit > 0 ? 'text-green' : netProfit < 0 ? 'text-red' : ''}`}>
            {netProfit >= 0 ? '+' : ''}{netReturnPct.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Performance Plot Chart */}
      <div className="analysis-section" style={{ flex: 1.5, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: '320px', padding: '12px 24px', borderBottom: '1px solid var(--border-color)' }}>
        <div className="section-subtitle" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span>Unrealized Performance Over Time</span>
          {holdingsListLength() > 0 && (
            <button onClick={handleRefreshPrices} disabled={isRefreshing} className="btn-refresh" title="Refresh chart data" aria-label="Refresh chart data" style={{ width: 'auto', padding: '0 10px', gap: '6px', fontSize: '11px' }}>
              <i className={`fa-solid fa-arrows-rotate ${isRefreshing ? 'fa-spin' : ''}`}></i>
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh Chart'}</span>
            </button>
          )}
        </div>
        <div style={{ position: 'relative', height: '260px', width: '100%' }} id="performanceChartContainer">
          <canvas ref={performanceCanvasRef} id="portfolioPerformanceChart" style={{ width: '100%', height: '100%' }}></canvas>
          {holdingsListLength() === 0 && (
            <div id="performanceEmptyMsg" className="empty-pill-msg" style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', width: '100%' }}>
              No performance history available yet. Record transactions to plot history.
            </div>
          )}
        </div>
      </div>

      {/* Holdings grid table */}
      <div className="analysis-section" style={{ flex: 2, display: 'flex', flexDirection: 'column', overflow: 'hidden', paddingBottom: '10px', minHeight: '450px' }}>
        <div className="section-subtitle" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span>Active Assets Portfolio</span>
          {holdingsKeys.length > 0 && (
            <button onClick={handleRefreshPrices} disabled={isRefreshing} className="btn-refresh" title="Refresh stock prices" aria-label="Refresh stock prices" style={{ width: 'auto', padding: '0 10px', gap: '6px', fontSize: '11px' }}>
              <i className={`fa-solid fa-arrows-rotate ${isRefreshing ? 'fa-spin' : ''}`}></i>
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          )}
        </div>
        <div className="projection-table-wrapper" style={{ flex: 1, overflowY: 'auto', maxHeight: '550px' }}>
          {sortedHoldings.length === 0 ? (
            <div className="empty-table-state" id="emptyPortfolioState" style={{ display: 'flex', padding: '40px 0', position: 'relative', background: 'transparent' }}>
              <div className="empty-icon"><i className="fa-solid fa-briefcase"></i></div>
              <p className="empty-title">Your Portfolio is Empty</p>
              <p className="empty-desc">Search for a ticker and record a BUY transaction in the left panel to build your portfolio holdings.</p>
            </div>
          ) : (
            <table className="projection-table" id="portfolioTable" style={{ margin: 0, width: '100%', display: 'table' }}>
              <thead>
                <tr>
                  <th onClick={() => handleSort('ticker')} className="sortable">Asset {renderSortIcon('ticker')}</th>
                  <th onClick={() => handleSort('shares')} className="sortable">Shares {renderSortIcon('shares')}</th>
                  <th onClick={() => handleSort('avgCost')} className="sortable">Avg Cost {renderSortIcon('avgCost')}</th>
                  <th onClick={() => handleSort('currentPrice')} className="sortable">Market Price {renderSortIcon('currentPrice')}</th>
                  <th onClick={() => handleSort('totalCost')} className="sortable">Total Cost {renderSortIcon('totalCost')}</th>
                  <th onClick={() => handleSort('marketValue')} className="sortable">Market Value {renderSortIcon('marketValue')}</th>
                  <th onClick={() => handleSort('pnlVal')} className="sortable">Unrealized P&L {renderSortIcon('pnlVal')}</th>
                  <th style={{ width: '70px', textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {sortedHoldings.map(h => (
                  <tr key={h.ticker}>
                    <td style={{ fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--cyan)' }}>
                      {h.ticker}
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 400, display: 'block' }}>{h.name}</span>
                    </td>
                    <td style={{ fontWeight: 700 }}>{parseFloat(h.shares.toFixed(6))}</td>
                    <td>{formatCurrency(h.avgCost)}</td>
                    <td style={{ fontWeight: 700, color: '#fff' }}>{formatCurrency(h.currentPrice)}</td>
                    <td>{formatCurrency(h.totalCost)}</td>
                    <td style={{ fontWeight: 700, color: 'var(--cyan)' }}>{formatCurrency(h.marketValue)}</td>
                    <td style={{ fontWeight: 700, color: h.pnlVal >= 0 ? 'var(--bullish)' : 'var(--bearish)' }}>
                      {h.pnlVal >= 0 ? '+' : ''}{formatCurrency(h.pnlVal)}
                      <span style={{ fontSize: '10px', display: 'block', fontWeight: 500 }}>({h.pnlVal >= 0 ? '+' : ''}{h.pnlPct.toFixed(2)}%)</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button onClick={() => handleSellAll(h.ticker, h.shares, h.currentPrice)} className="btn btn-tx-sell-all" style={{ background: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244, 63, 94, 0.2)', color: 'var(--bearish)', padding: '4px 8px', fontSize: '10px', borderRadius: '4px', cursor: 'pointer', transition: 'all var(--transition-fast)' }}>
                        Sell All
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Transaction Audit Log */}
      <div className="analysis-section" style={{ flex: 1.2, display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--border-color)', overflow: 'hidden', maxHeight: '500px', minHeight: '350px' }}>
        <div className="section-subtitle">Transaction Audit Log</div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }} id="portfolioLogList">
            {activePortfolio.transactions.length === 0 ? (
              <li className="empty-pill-msg" style={{ textAlign: 'center', paddingTop: '15px' }}>No transactions recorded.</li>
            ) : (
              [...activePortfolio.transactions].reverse().map((tx, idx) => {
                const actualIndex = activePortfolio.transactions.length - 1 - idx;
                const txFees = parseFloat(tx.fees) || 0;
                const feesStr = txFees > 0 ? ` | Fee: ${formatCurrency(txFees)}` : '';
                const accountStr = tx.account && tx.account !== 'Default' ? ` | Account: ${tx.account}` : '';

                return (
                  <li key={`tx-log-${actualIndex}`} className="tx-log-item">
                    <div>
                      <span className={`type-badge ${tx.type.toLowerCase()}`}>{tx.type}</span>
                      <strong>{parseFloat(tx.shares.toFixed(6))} {tx.ticker}</strong> @ {formatCurrency(tx.price)}
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>
                        Gross: {formatCurrency(tx.shares * tx.price)}{feesStr}{accountStr}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="tx-time">{formattedDate(tx.timestamp)}</span>
                      <button onClick={() => {
                        const confirmDelete = confirm("Do you want to delete this transaction entry? This will revert its effect on your holdings.");
                        if (confirmDelete) {
                          onDeleteTransaction(activePortfolio.id, actualIndex);
                        }
                      }} className="btn-tx-delete" title="Delete transaction entry"><i className="fa-solid fa-xmark"></i></button>
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
