import { useAppearance, systemFont } from '../../theme/appearanceContext.js';
import { useEffect, useRef, useMemo } from 'react';
import { Chart, registerables } from 'chart.js';
import {
  detectTickerCurrency,
  formatMoney,
  convertCurrency
} from '../../utils/currencyUtils';

Chart.register(...registerables);

const ALLOCATION_COLORS = ['#0d8074', '#587eab', '#bd9c69', '#8c81a6', '#7e9b76', '#af7c89', '#6f9fa5', '#8b8fae', '#c28c67', '#9b9b64'];

export default function AllocationDonut({ activePortfolio, stocks, baseCurrency = 'USD' }) {
  const { palette } = useAppearance();
  const allocationCanvasRef = useRef(null);
  const allocationChartRef = useRef(null);

  const fxRate = stocks?.['USDTHB=X']?.price || 35.5;

  // Compute live valuation per holding converted to portfolio baseCurrency
  const { holdingsList, totalAssetValue } = useMemo(() => {
    let total = 0;
    const holdings = activePortfolio?.holdings || {};
    const list = Object.keys(holdings)
      .filter(t => (holdings[t]?.shares || 0) > 0)
      .map(ticker => {
        const holding = holdings[ticker];
        const stockMeta = stocks?.[ticker] || { price: holding.avgCost, name: `${ticker} Stock` };
        const stockPrice = stockMeta.price || holding.avgCost;
        const nativeMarketValue = holding.shares * stockPrice;
        const assetCurrency = detectTickerCurrency(ticker);
        const baseMarketValue = convertCurrency(nativeMarketValue, assetCurrency, baseCurrency, fxRate);
        total += baseMarketValue;
        return {
          ticker,
          name: stockMeta.name || `${ticker} Stock`,
          shares: holding.shares,
          price: stockPrice,
          currency: assetCurrency,
          marketValue: nativeMarketValue,
          baseMarketValue
        };
      })
      .sort((a, b) => (b.baseMarketValue || 0) - (a.baseMarketValue || 0));
    return { holdingsList: list, totalAssetValue: total };
  }, [activePortfolio?.holdings, stocks, baseCurrency, fxRate]);

  // Render Allocation Doughnut Chart using Chart.js on holdings changes
  useEffect(() => {
    if (!allocationCanvasRef.current) return;

    if (allocationChartRef.current) {
      allocationChartRef.current.destroy();
      allocationChartRef.current = null;
    }

    if (holdingsList.length === 0 || totalAssetValue === 0) {
      return;
    }

    const ctx = allocationCanvasRef.current.getContext('2d');
    allocationChartRef.current = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: holdingsList.map(h => h.ticker),
        datasets: [{
          data: holdingsList.map(h => parseFloat(Number(h.baseMarketValue || 0).toFixed(2))),
          backgroundColor: ALLOCATION_COLORS.slice(0, holdingsList.length),
          borderColor: palette.surface,
          borderWidth: 3,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        // Financial values update immediately, including when reduced motion is enabled.
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: palette.tooltip,
            titleColor: palette.tooltipText,
            bodyColor: palette.tooltipText,
            borderColor: palette.grid,
            borderWidth: 1,
            titleFont: { family: systemFont, weight: '700', size: 12 },
            bodyFont: { family: systemFont, size: 11 },
            padding: 10,
            cornerRadius: 8,
            displayColors: false,
            callbacks: {
              label: function (context) {
                const val = context.parsed;
                const pct = totalAssetValue > 0 ? (val / totalAssetValue) * 100 : 0;
                return ` ${context.label}: ${formatMoney(val, baseCurrency)} (${pct.toFixed(1)}%)`;
              }
            }
          }
        },
        cutout: '72%'
      }
    });

    return () => {
      if (allocationChartRef.current) {
        allocationChartRef.current.destroy();
        allocationChartRef.current = null;
      }
    };
  }, [holdingsList, totalAssetValue, baseCurrency, palette]);

  return (
    <div className="analysis-section allocation-section">
      <div className="section-subtitle">
        <span>Asset Allocation</span>
        <span className="allocation-count-badge tabular-nums">
          {holdingsList.length} {holdingsList.length === 1 ? 'Asset' : 'Assets'}
        </span>
      </div>

      {holdingsList.length > 0 && totalAssetValue > 0 ? (
        <>
          <div className="donut-chart-container">
            <canvas ref={allocationCanvasRef}></canvas>
            <div className="donut-center-info">
              <span className="donut-center-label">Total Value</span>
              <span className="donut-center-value tabular-nums">
                {formatMoney(totalAssetValue, baseCurrency)}
              </span>
              <span className="donut-center-sub">{holdingsList.length} Active Holdings</span>
            </div>
          </div>

          {/* Allocation Legend List */}
          <div className="allocation-legend-list">
            {holdingsList.map((item, idx) => {
              const weight = totalAssetValue > 0 ? (item.baseMarketValue / totalAssetValue) * 100 : 0;
              const color = ALLOCATION_COLORS[idx % ALLOCATION_COLORS.length];
              return (
                <div key={item.ticker} className="allocation-legend-item">
                  <div className="legend-left">
                    <span className="legend-color-dot" style={{ backgroundColor: color }}></span>
                    <span className="legend-ticker">{item.ticker}</span>
                    <span className="legend-shares tabular-nums">{parseFloat(item.shares.toFixed(4))} sh</span>
                  </div>
                  <div className="legend-right">
                    <span className="legend-value tabular-nums">
                      {formatMoney(item.baseMarketValue, baseCurrency)}
                    </span>
                    <span className="legend-weight-pill tabular-nums">
                      {weight.toFixed(1)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="empty-allocation-card">
          <i className="fa-solid fa-chart-pie empty-donut-icon"></i>
          <span className="empty-title">No Active Holdings</span>
          <span className="empty-desc">Record your first BUY transaction below to build your asset allocation.</span>
        </div>
      )}
    </div>
  );
}
