import React, { useMemo } from 'react';

export default function AnalysisEngine({
  activeTicker,
  currentPrice,
  lines,
  setLinesMap,
  linesMap,
  currentCapital,
  setCurrentCapital,
  activeTickerHoldings = [],
  activeStockPrice = 0,
  liveRawValues = []
}) {
  const supports = [];
  const resistances = [];

  lines.forEach((price) => {
    if (price < currentPrice) {
      supports.push(price);
    } else {
      resistances.push(price);
    }
  });

  // Sort: Supports Descending (closest support first), Resistances Ascending (closest resistance first)
  supports.sort((a, b) => b - a);
  resistances.sort((a, b) => a - b);

  const handleClearAll = () => {
    setLinesMap({
      ...linesMap,
      [activeTicker]: []
    });
  };

  const handleRemoveLine = (priceToRemove) => {
    const newLines = lines.filter((p) => p !== priceToRemove);
    setLinesMap({
      ...linesMap,
      [activeTicker]: newLines
    });
  };

  const handleAutoDetectLevels = () => {
    const price = currentPrice || 150;
    const detected = new Set(linesMap[activeTicker] || []);

    if (liveRawValues && liveRawValues.length > 5) {
      const closes = liveRawValues.map(v => parseFloat(v.close || v.open)).filter(p => !isNaN(p) && p > 0);
      const highs = liveRawValues.map(v => parseFloat(v.high || v.close)).filter(p => !isNaN(p) && p > 0);
      const lows = liveRawValues.map(v => parseFloat(v.low || v.close)).filter(p => !isNaN(p) && p > 0);

      const maxHigh = Math.max(...highs);
      const minLow = Math.min(...lows);

      if (maxHigh > price * 1.005) detected.add(parseFloat(maxHigh.toFixed(2)));
      if (minLow < price * 0.995) detected.add(parseFloat(minLow.toFixed(2)));

      // Scan local swing peaks & valleys
      for (let i = 2; i < closes.length - 2; i++) {
        const prev2 = closes[i - 2];
        const prev1 = closes[i - 1];
        const curr = closes[i];
        const next1 = closes[i + 1];
        const next2 = closes[i + 2];

        // Resistance Peak
        if (curr > prev1 && curr > prev2 && curr > next1 && curr > next2 && curr > price * 1.01) {
          detected.add(parseFloat(curr.toFixed(2)));
        }
        // Support Valley
        if (curr < prev1 && curr < prev2 && curr < next1 && curr < next2 && curr < price * 0.99) {
          detected.add(parseFloat(curr.toFixed(2)));
        }
      }
    }

    // Ensure at least 2 supports and 2 resistances
    const currentSupCount = Array.from(detected).filter(p => p < price).length;
    const currentResCount = Array.from(detected).filter(p => p > price).length;

    if (currentSupCount === 0) {
      detected.add(parseFloat((price * 0.96).toFixed(2)));
      detected.add(parseFloat((price * 0.91).toFixed(2)));
    } else if (currentSupCount === 1) {
      detected.add(parseFloat((price * 0.88).toFixed(2)));
    }

    if (currentResCount === 0) {
      detected.add(parseFloat((price * 1.05).toFixed(2)));
      detected.add(parseFloat((price * 1.12).toFixed(2)));
    } else if (currentResCount === 1) {
      detected.add(parseFloat((price * 1.18).toFixed(2)));
    }

    const finalLevels = Array.from(detected).sort((a, b) => a - b);
    setLinesMap({
      ...linesMap,
      [activeTicker]: finalLevels
    });
  };

  const handleCapitalChange = (e) => {
    const valString = String(e.target.value).replace(/,/g, '').trim();
    let val = parseFloat(valString);
    if (isNaN(val) || val <= 0) val = 100;
    setCurrentCapital(val);
  };

  const hasLevels = supports.length > 0 && resistances.length > 0;

  // Compute best trade setup across all combinations
  const bestScenario = useMemo(() => {
    if (!hasLevels) return null;
    let best = null;
    let highestRR = -Infinity;

    supports.forEach((sup) => {
      resistances.forEach((res) => {
        if (sup < res) {
          const roi = ((res - sup) / sup) * 100;
          const profit = (currentCapital / sup) * (res - sup);
          const risk = currentPrice - sup > 0 ? currentPrice - sup : sup * 0.02;
          const reward = res - currentPrice > 0 ? res - currentPrice : res - sup;
          const rr = risk > 0 ? (reward / risk) : 1;

          if (rr > highestRR) {
            highestRR = rr;
            best = { sup, res, roi, profit, rr };
          }
        }
      });
    });

    return best;
  }, [supports, resistances, currentCapital, currentPrice, hasLevels]);

  return (
    <section className="panel panel-right" aria-label="Trading Strategy & Analysis">
      <div className="panel-header">
        <h2 className="panel-title">
          <i className="fa-solid fa-layer-group"></i> Analysis Engine
        </h2>
      </div>

      {/* Holdings Section */}
      {activeTickerHoldings.length > 0 && (
        <div className="analysis-section">
          <div className="section-subtitle">
            <span><i className="fa-solid fa-briefcase" style={{ marginRight: '6px', color: 'var(--cyan)' }}></i>Holdings — {activeTicker}</span>
          </div>
          {activeTickerHoldings.map(h => {
            const pnl = (activeStockPrice - h.avgCost) * h.shares;
            const pnlPct = h.avgCost ? ((activeStockPrice - h.avgCost) / h.avgCost * 100) : 0;
            return (
              <div key={h.portfolioId} className="holding-row">
                <div className="holding-row-header">
                  <span className="holding-row-name">{h.portfolioName}</span>
                  <span className={`holding-row-pnl tabular-nums ${pnl >= 0 ? 'positive' : 'negative'}`}>
                    {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} ({pnlPct.toFixed(1)}%)
                  </span>
                </div>
                <div className="holding-row-details tabular-nums">
                  <span>{parseFloat(h.shares.toFixed(4))} shares @ ${h.avgCost.toFixed(2)}</span>
                  <span>Value: ${(h.shares * activeStockPrice).toFixed(2)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Identified Price Levels Tracker */}
      <div className="analysis-section">
        <div className="section-subtitle">
          <span>Identified Price Levels</span>
          <div className="levels-actions-group">
            <button
              onClick={handleAutoDetectLevels}
              className="btn-auto-levels"
              title="Automatically detect key support and resistance levels"
            >
              <i className="fa-solid fa-wand-magic-sparkles"></i> Auto Levels
            </button>
            <button
              onClick={handleClearAll}
              className="btn-clear-lines"
              id="clearAllLines"
              title="Clear all price levels"
            >
              <i className="fa-solid fa-trash-can"></i> Clear All
            </button>
          </div>
        </div>

        <div className="levels-scroller">
          {/* Support Levels */}
          <div className="levels-sub-header text-green">
            <i className="fa-solid fa-circle-chevron-up"></i> Support Levels
          </div>
          <ul className="level-pills-list">
            {supports.length === 0 ? (
              <li className="empty-pill-msg">No support lines set. Click on chart below current price or click Auto Levels.</li>
            ) : (
              supports.map((price) => {
                const diff = currentPrice - price;
                const pct = currentPrice > 0 ? (diff / currentPrice) * 100 : 0;
                return (
                  <li key={`sup-${price}`} className="level-pill sup">
                    <div className="level-pill-info">
                      <span className="level-price tabular-nums">${price.toFixed(2)}</span>
                      <span className="level-diff tabular-nums">-${diff.toFixed(2)} (-{pct.toFixed(1)}%)</span>
                    </div>
                    <button
                      onClick={() => handleRemoveLine(price)}
                      className="pill-delete-btn"
                      title={`Delete support level $${price}`}
                    >
                      <i className="fa-solid fa-trash"></i>
                    </button>
                  </li>
                );
              })
            )}
          </ul>

          {/* Resistance Levels */}
          <div className="levels-sub-header text-red" style={{ marginTop: '14px' }}>
            <i className="fa-solid fa-circle-chevron-down"></i> Resistance Levels
          </div>
          <ul className="level-pills-list">
            {resistances.length === 0 ? (
              <li className="empty-pill-msg">No resistance lines set. Click on chart above current price or click Auto Levels.</li>
            ) : (
              resistances.map((price) => {
                const diff = price - currentPrice;
                const pct = currentPrice > 0 ? (diff / currentPrice) * 100 : 0;
                return (
                  <li key={`res-${price}`} className="level-pill res">
                    <div className="level-pill-info">
                      <span className="level-price tabular-nums">${price.toFixed(2)}</span>
                      <span className="level-diff tabular-nums">+${diff.toFixed(2)} (+{pct.toFixed(1)}%)</span>
                    </div>
                    <button
                      onClick={() => handleRemoveLine(price)}
                      className="pill-delete-btn"
                      title={`Delete resistance level $${price}`}
                    >
                      <i className="fa-solid fa-trash"></i>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      </div>

      {/* Trade Projections Matrix */}
      <div className="analysis-section" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div className="section-subtitle">
          <span>Profit Projections Matrix</span>
          <div className="capital-input-wrapper">
            <span className="capital-prefix">$</span>
            <input
              type="number"
              value={currentCapital}
              onChange={handleCapitalChange}
              min="100"
              step="100"
              className="capital-input tabular-nums"
              title="Allocated trade capital"
            />
          </div>
        </div>

        {/* Optimal Setup Banner */}
        {hasLevels && bestScenario && (
          <div className="best-trade-banner">
            <div className="best-trade-top">
              <span className="best-trade-title">
                <i className="fa-solid fa-crosshairs"></i> Top Setup R:R
              </span>
              <span className={`rr-pill tabular-nums ${bestScenario.rr >= 2.0 ? 'rr-high' : bestScenario.rr >= 1.2 ? 'rr-mid' : 'rr-low'}`}>
                1 : {bestScenario.rr.toFixed(1)} R:R
              </span>
            </div>
            <div className="best-trade-stats">
              <div className="best-stat">
                <span className="stat-label">Entry</span>
                <span className="stat-val text-green tabular-nums">${bestScenario.sup.toFixed(2)}</span>
              </div>
              <div className="best-stat">
                <span className="stat-label">Target</span>
                <span className="stat-val text-red tabular-nums">${bestScenario.res.toFixed(2)}</span>
              </div>
              <div className="best-stat">
                <span className="stat-label">Est. Gain</span>
                <span className="stat-val text-cyan tabular-nums">+${bestScenario.profit.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}

        <div className="projection-table-wrapper">
          {hasLevels ? (
            <table className="projection-table" id="projectionTable">
              <thead>
                <tr>
                  <th>SUP \ RES</th>
                  {resistances.map((res) => (
                    <th key={`h-res-${res}`} className="price-label-res tabular-nums">
                      ${res.toFixed(2)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {supports.map((sup) => (
                  <tr key={`r-sup-${sup}`}>
                    <td className="price-label-sup tabular-nums">${sup.toFixed(2)}</td>
                    {resistances.map((res) => {
                      if (sup < res) {
                        const roi = ((res - sup) / sup) * 100;
                        const estProfit = (currentCapital / sup) * (res - sup);
                        const risk = currentPrice - sup > 0 ? currentPrice - sup : sup * 0.02;
                        const reward = res - currentPrice > 0 ? res - currentPrice : res - sup;
                        const rr = risk > 0 ? (reward / risk) : 1;
                        const rrClass = rr >= 2.0 ? 'rr-high' : rr >= 1.2 ? 'rr-mid' : 'rr-low';

                        return (
                          <td key={`cell-${sup}-${res}`}>
                            <span className="matrix-cell-profit tabular-nums">
                              +${estProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <div className="matrix-cell-sub">
                              <span className="matrix-cell-roi tabular-nums">+{roi.toFixed(1)}%</span>
                              <span className={`matrix-cell-rr tabular-nums ${rrClass}`}>{rr.toFixed(1)} R:R</span>
                            </div>
                          </td>
                        );
                      } else {
                        return (
                          <td key={`cell-${sup}-${res}`}>
                            <span className="matrix-cell-invalid">—</span>
                          </td>
                        );
                      }
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-table-state" id="emptyMatrixState" style={{ display: 'flex' }}>
              <div className="empty-icon">
                <i className="fa-solid fa-cubes"></i>
              </div>
              <p className="empty-title">Formulate a Strategy</p>
              <p className="empty-desc">
                Click <strong>Auto Levels</strong> or click on the chart canvas to set Support & Resistance price targets.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

