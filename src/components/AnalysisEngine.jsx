import React from 'react';

export default function AnalysisEngine({
  activeTicker,
  currentPrice,
  lines,
  setLinesMap,
  linesMap,
  currentCapital,
  setCurrentCapital
}) {
  const supports = [];
  const resistances = [];

  lines.forEach((price) => {
    // Check using delta bounds or simple comparison
    if (price < currentPrice) {
      supports.push(price);
    } else {
      resistances.push(price);
    }
  });

  // Sort: Supports Descending, Resistances Ascending
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

  const handleCapitalChange = (e) => {
    // Clean spaces/commas from input first
    const valString = String(e.target.value).replace(/,/g, '').trim();
    let val = parseFloat(valString);
    if (isNaN(val) || val <= 0) val = 100;
    setCurrentCapital(val);
  };

  const hasLevels = supports.length > 0 && resistances.length > 0;

  return (
    <section className="panel panel-right" aria-label="Trading Strategy & Analysis">
      <div className="panel-header">
        <h2 className="panel-title">
          <i className="fa-solid fa-layer-group"></i> Analysis Engine
        </h2>
      </div>

      {/* Identified Price Levels Tracker */}
      <div className="analysis-section">
        <div className="section-subtitle">
          <span>Identified Price Levels</span>
          <button
            onClick={handleClearAll}
            className="btn btn-clear-lines"
            id="clearAllLines"
            style={{ padding: '4px 10px', fontSize: '11px', margin: 0, display: 'inline-flex', height: 'auto' }}
          >
            <i className="fa-solid fa-trash-can"></i> Clear All
          </button>
        </div>
        <div className="levels-scroller">
          <div className="levels-sub-header text-green">
            <i className="fa-solid fa-circle-chevron-up"></i> Support Levels
          </div>
          <ul className="level-pills-list">
            {supports.length === 0 ? (
              <li className="empty-pill-msg">No support lines set. Click on chart below current price.</li>
            ) : (
              supports.map((price) => (
                <li key={`sup-${price}`} className="level-pill sup">
                  <span>${price.toFixed(2)}</span>
                  <button
                    onClick={() => handleRemoveLine(price)}
                    className="pill-delete-btn"
                    title={`Delete support level $${price}`}
                  >
                    <i className="fa-solid fa-trash"></i>
                  </button>
                </li>
              ))
            )}
          </ul>

          <div className="levels-sub-header text-red" style={{ marginTop: '15px' }}>
            <i className="fa-solid fa-circle-chevron-down"></i> Resistance Levels
          </div>
          <ul className="level-pills-list">
            {resistances.length === 0 ? (
              <li className="empty-pill-msg">No resistance lines set. Click on chart above current price.</li>
            ) : (
              resistances.map((price) => (
                <li key={`res-${price}`} className="level-pill res">
                  <span>${price.toFixed(2)}</span>
                  <button
                    onClick={() => handleRemoveLine(price)}
                    className="pill-delete-btn"
                    title={`Delete resistance level $${price}`}
                  >
                    <i className="fa-solid fa-trash"></i>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>

      {/* Trade Projections Matrix */}
      <div className="analysis-section" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div className="section-subtitle">
          <span>Profit Projections Matrix</span>
          <div
            className="capital-input-wrapper"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid var(--border-color)',
              padding: '2px 8px',
              borderRadius: '6px',
              margin: 0,
              boxShadow: 'none',
              flexDirection: 'row',
            }}
          >
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700 }}>$</span>
            <input
              type="number"
              value={currentCapital}
              onChange={handleCapitalChange}
              min="100"
              step="100"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--cyan)',
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: '12px',
                outline: 'none',
                width: '85px',
                textAlign: 'right',
                padding: 0,
                margin: 0,
                boxShadow: 'none',
              }}
            />
          </div>
        </div>

        <div className="projection-table-wrapper">
          {hasLevels ? (
            <table className="projection-table" id="projectionTable" style={{ display: 'table' }}>
              <thead>
                <tr>
                  <th>SUP \ RES</th>
                  {resistances.map((res) => (
                    <th key={`h-res-${res}`} className="price-label-res">
                      ${res.toFixed(2)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {supports.map((sup) => (
                  <tr key={`r-sup-${sup}`}>
                    <td className="price-label-sup">${sup.toFixed(2)}</td>
                    {resistances.map((res) => {
                      if (sup < res) {
                        const roi = ((res - sup) / sup) * 100;
                        const estProfit = (currentCapital / sup) * (res - sup);
                        return (
                          <td key={`cell-${sup}-${res}`}>
                            <span className="matrix-cell-profit">
                              +${estProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <span className="matrix-cell-roi">+{roi.toFixed(2)}%</span>
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
                Create at least one <strong>Support</strong> (below current price) and one <strong>Resistance</strong>{' '}
                (above current price) line to project potential trade returns.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
