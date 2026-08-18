import { useMemo } from 'react';

export default function AnalysisEngine({
  activeTicker,
  currentPrice,
  lines = [],
  setLinesMap,
  linesMap,
  currentCapital,
  setCurrentCapital,
  activeTickerHoldings = [],
  activeStockPrice = 0,
  liveRawValues = []
}) {
  const { supports, resistances } = useMemo(() => {
    const sups = [];
    const res = [];

    (lines || []).forEach((price) => {
      if (price < currentPrice) {
        sups.push(price);
      } else {
        res.push(price);
      }
    });

    // Sort: Supports Descending (closest support first), Resistances Ascending (closest resistance first)
    sups.sort((a, b) => b - a);
    res.sort((a, b) => a - b);
    return { supports: sups, resistances: res };
  }, [lines, currentPrice]);

  const handleClearAll = () => {
    setLinesMap(prev => ({
      ...prev,
      [activeTicker]: []
    }));
  };

  const handleRemoveLine = (priceToRemove) => {
    setLinesMap(prev => ({
      ...prev,
      [activeTicker]: (prev[activeTicker] || []).filter((p) => p !== priceToRemove)
    }));
  };

  const handleAutoDetectLevels = () => {
    const price = currentPrice || 150;
    const rawSupports = [];
    const rawResistances = [];

    // Prioritize existing manual lines if any
    const existing = linesMap[activeTicker] || [];
    existing.forEach((p) => {
      if (p < price) rawSupports.push({ price: p, priority: 100 });
      else if (p > price) rawResistances.push({ price: p, priority: 100 });
    });

    if (liveRawValues && liveRawValues.length > 5) {
      const closes = liveRawValues.map((v) => parseFloat(v.close || v.open)).filter((p) => !isNaN(p) && p > 0);
      const highs = liveRawValues.map((v) => parseFloat(v.high || v.close)).filter((p) => !isNaN(p) && p > 0);
      const lows = liveRawValues.map((v) => parseFloat(v.low || v.close)).filter((p) => !isNaN(p) && p > 0);

      // Scan multi-bar swing peaks & valleys with prominence
      const window = Math.min(4, Math.max(2, Math.floor(closes.length / 10)));
      for (let i = window; i < closes.length - window; i++) {
        const currHigh = highs[i] || closes[i];
        const currLow = lows[i] || closes[i];

        let isPeak = true;
        let isValley = true;
        for (let j = 1; j <= window; j++) {
          if ((highs[i - j] || closes[i - j]) >= currHigh || (highs[i + j] || closes[i + j]) >= currHigh) {
            isPeak = false;
          }
          if ((lows[i - j] || closes[i - j]) <= currLow || (lows[i + j] || closes[i + j]) <= currLow) {
            isValley = false;
          }
        }

        if (isPeak && currHigh > price * 1.01) {
          rawResistances.push({ price: parseFloat(currHigh.toFixed(2)), priority: 70 });
        }
        if (isValley && currLow < price * 0.99) {
          rawSupports.push({ price: parseFloat(currLow.toFixed(2)), priority: 70 });
        }
      }

      // Add psychological round numbers
      const roundBase = price > 500 ? 50 : price > 100 ? 10 : price > 20 ? 5 : 1;
      const lowerRound = Math.floor(price / roundBase) * roundBase;
      const upperRound = Math.ceil(price / roundBase) * roundBase;

      if (lowerRound < price * 0.99 && lowerRound > 0) {
        rawSupports.push({ price: lowerRound, priority: 50 });
      }
      if (upperRound > price * 1.01) {
        rawResistances.push({ price: upperRound, priority: 50 });
      }
    }

    // Cluster and pick top 2 supports and top 2 resistances
    const clusterLevels = (arr, isSup) => {
      if (arr.length === 0) return [];
      arr.sort((a, b) => b.priority - a.priority);

      const clustered = [];
      arr.forEach((item) => {
        const isDuplicate = clustered.some((c) => Math.abs(c.price - item.price) / item.price < 0.02);
        if (!isDuplicate) {
          clustered.push(item);
        }
      });

      clustered.sort((a, b) => isSup ? b.price - a.price : a.price - b.price);
      return clustered.slice(0, 2).map((c) => c.price);
    };

    let finalSupports = clusterLevels(rawSupports, true);
    let finalResistances = clusterLevels(rawResistances, false);

    // Fallback if no dynamic levels found
    if (finalSupports.length === 0) {
      finalSupports = [
        parseFloat((price * 0.95).toFixed(2)),
        parseFloat((price * 0.90).toFixed(2))
      ];
    } else if (finalSupports.length === 1) {
      const sup1 = finalSupports[0];
      finalSupports.push(parseFloat((sup1 * 0.94).toFixed(2)));
    }

    if (finalResistances.length === 0) {
      finalResistances = [
        parseFloat((price * 1.05).toFixed(2)),
        parseFloat((price * 1.10).toFixed(2))
      ];
    } else if (finalResistances.length === 1) {
      const res1 = finalResistances[0];
      finalResistances.push(parseFloat((res1 * 1.06).toFixed(2)));
    }

    setLinesMap((prev) => {
      const existingManual = prev[activeTicker] || [];
      const merged = Array.from(new Set([...existingManual, ...finalSupports, ...finalResistances])).sort((a, b) => a - b);
      return {
        ...prev,
        [activeTicker]: merged
      };
    });
  };

  const handleCapitalChange = (e) => {
    const valString = String(e.target.value).replace(/,/g, '').trim();
    if (valString === '') {
      setCurrentCapital('');
      return;
    }
    const val = parseFloat(valString);
    if (!isNaN(val)) {
      setCurrentCapital(val);
    }
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
          const profit = (Number(currentCapital || 100) / sup) * (res - sup);
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
            const hasLivePrice = activeStockPrice && activeStockPrice > 0;
            const pnl = hasLivePrice ? (activeStockPrice - h.avgCost) * h.shares : 0;
            const pnlPct = hasLivePrice && h.avgCost ? ((activeStockPrice - h.avgCost) / h.avgCost * 100) : 0;
            return (
              <div key={h.portfolioId} className="holding-row">
                <div className="holding-row-header">
                  <span className="holding-row-name">{h.portfolioName}</span>
                  {hasLivePrice ? (
                    <span className={`holding-row-pnl tabular-nums ${pnl >= 0 ? 'positive' : 'negative'}`}>
                      {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} ({pnlPct.toFixed(1)}%)
                    </span>
                  ) : (
                    <span className="holding-row-pnl tabular-nums text-muted">
                      Syncing price...
                    </span>
                  )}
                </div>
                <div className="holding-row-details tabular-nums">
                  <span>{parseFloat(h.shares.toFixed(4))} shares @ ${h.avgCost.toFixed(2)}</span>
                  <span>Value: {hasLivePrice ? `$${(h.shares * activeStockPrice).toFixed(2)}` : '...'}</span>
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

        {/* Dedicated Support & Resistance Level Groups */}
        <div className="levels-container">
          {/* Support Group */}
          <div className="level-group-box sup-group">
            <div className="level-group-header text-green">
              <div className="level-group-title">
                <i className="fa-solid fa-circle-chevron-up"></i>
                <span>Support Levels</span>
              </div>
              <span className="level-count-tag tabular-nums">{supports.length}</span>
            </div>
            <div className="level-pills-scroll">
              <ul className="level-pills-list">
                {supports.length === 0 ? (
                  <li className="empty-pill-msg">No support lines set. Click on chart below price or click Auto Levels.</li>
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
                          aria-label={`Delete support level $${price}`}
                        >
                          <i className="fa-solid fa-xmark"></i>
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          </div>

          {/* Resistance Group */}
          <div className="level-group-box res-group">
            <div className="level-group-header text-red">
              <div className="level-group-title">
                <i className="fa-solid fa-circle-chevron-down"></i>
                <span>Resistance Levels</span>
              </div>
              <span className="level-count-tag tabular-nums">{resistances.length}</span>
            </div>
            <div className="level-pills-scroll">
              <ul className="level-pills-list">
                {resistances.length === 0 ? (
                  <li className="empty-pill-msg">No resistance lines set. Click on chart above price or click Auto Levels.</li>
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
                          aria-label={`Delete resistance level $${price}`}
                        >
                          <i className="fa-solid fa-xmark"></i>
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Trade Projections Matrix */}
      <div className="analysis-section matrix-section">
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

