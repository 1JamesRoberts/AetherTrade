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
          backgroundColor: holdingsList.map((_, index) => ALLOCATION_COLORS[index % ALLOCATION_COLORS.length]),
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
    <section className="analysis-section allocation-section" aria-label="Asset allocation">
      <header className="portfolio-card-heading"><div><h3>Allocation</h3><p>Where your portfolio is invested</p></div><span className="allocation-currency">{baseCurrency}</span></header>
      {holdingsList.length > 0 && totalAssetValue > 0 ? <>
        <div className="allocation-composition">
          <div className="donut-chart-container"><canvas ref={allocationCanvasRef} role="img" aria-label="Asset weights by market value; breakdown follows below" /><div className="donut-center-info"><span className="donut-center-value tabular-nums">{holdingsList.length}</span><span className="donut-center-label">{holdingsList.length === 1 ? 'Holding' : 'Holdings'}</span></div></div>
          <div className="allocation-legend-list">{holdingsList.map((item, idx) => {
            const weight = totalAssetValue > 0 ? item.baseMarketValue / totalAssetValue * 100 : 0;
            const color = ALLOCATION_COLORS[idx % ALLOCATION_COLORS.length];
            return <div key={item.ticker} className="allocation-breakdown">
              <span className="allocation-swatch" style={{ background: color }} aria-hidden="true" />
              <div className="allocation-asset"><strong>{item.ticker}</strong><span className="tabular-nums">{parseFloat(item.shares.toFixed(4))} shares</span></div>
              <div className="allocation-amount tabular-nums"><strong>{weight.toFixed(1)}%</strong><span>{formatMoney(item.baseMarketValue, baseCurrency)}</span></div>
            </div>;
          })}</div>
        </div>
        <p className="allocation-caption">Weights based on current market value.</p>
      </> : <div className="portfolio-empty-state allocation-empty"><span aria-hidden="true">◌</span><h4>Room to grow</h4><p>Your allocation appears here after your first purchase.</p></div>}
    </section>
  );
}
