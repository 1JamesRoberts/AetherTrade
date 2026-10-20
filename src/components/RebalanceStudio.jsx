import { SegmentedControl, AssetMark } from './ui/Controls.jsx';
import { useState, useMemo } from 'react';
import {
  calculateEqualSplit,
  normalizeTargets,
  calculateDrift,
  resolveAssetPrice,
  computeFullRebalance,
  computeDepositRebalance
} from '../utils/rebalanceUtils';
import {
  detectTickerCurrency,
  getCurrencySymbol,
  formatMoney,
  convertCurrency
} from '../utils/currencyUtils';

export default function RebalanceStudio({
  activePortfolio,
  stocks = {},
  onUpdateTargetAllocations,
  onExecuteRebalance,
  onPrefillTrade,
  onAddTransaction,
  showNotification
}) {
  const [rebalanceMode, setRebalanceMode] = useState('full'); // 'full' | 'deposit'
  const [depositAmount, setDepositAmount] = useState(1000);
  const [isExecuting, setIsExecuting] = useState(false);

  const baseCurrency = activePortfolio.baseCurrency || 'USD';
  const fxRate = parseFloat(stocks['USDTHB=X']?.price) || 35.5;

  const holdings = useMemo(() => activePortfolio.holdings || {}, [activePortfolio.holdings]);
  const targetAllocations = useMemo(() => activePortfolio.targetAllocations || {}, [activePortfolio.targetAllocations]);

  // All relevant tickers: held stocks + any custom targeted tickers
  const activeTickers = useMemo(() => {
    const held = Object.keys(holdings).filter(t => (holdings[t]?.shares || 0) > 0);
    const targeted = Object.keys(targetAllocations).filter(t => (parseFloat(targetAllocations[t]) || 0) > 0);
    return Array.from(new Set([...held, ...targeted])).sort();
  }, [holdings, targetAllocations]);

  // Compute total asset value normalized to base currency
  const totalAssetValue = useMemo(() => {
    return activeTickers.reduce((acc, ticker) => {
      const nativePrice = resolveAssetPrice(ticker, holdings, stocks);
      const shares = holdings[ticker]?.shares || 0;
      const nativeVal = shares * nativePrice;
      const tickerCurr = detectTickerCurrency(ticker);
      const baseVal = convertCurrency(nativeVal, tickerCurr, baseCurrency, fxRate);
      return acc + baseVal;
    }, 0);
  }, [activeTickers, holdings, stocks, baseCurrency, fxRate]);

  // Compute total target percentage allocated
  const totalTargetPct = useMemo(() => {
    const sum = activeTickers.reduce((acc, ticker) => {
      return acc + (parseFloat(targetAllocations[ticker]) || 0);
    }, 0);
    return Math.round(sum * 100) / 100;
  }, [activeTickers, targetAllocations]);

  // Count untargeted positions that are currently held
  const untargetedHeldCount = useMemo(() => {
    return activeTickers.filter(t => {
      const isHeld = (holdings[t]?.shares || 0) > 0;
      const targetPct = parseFloat(targetAllocations[t]) || 0;
      return isHeld && targetPct <= 0;
    }).length;
  }, [activeTickers, holdings, targetAllocations]);

  // Handle target percentage change for a single ticker
  const handleTargetChange = (ticker, value) => {
    const parsed = value === '' ? '' : Math.max(0, Math.min(100, parseFloat(value) || 0));
    const nextTargets = {
      ...targetAllocations,
      [ticker]: parsed
    };
    onUpdateTargetAllocations(activePortfolio.id, nextTargets);
  };

  // Quick Action: Equal Split
  const handleEqualSplit = () => {
    if (activeTickers.length === 0) return;
    const split = calculateEqualSplit(activeTickers);
    onUpdateTargetAllocations(activePortfolio.id, split);
    showNotification('Applied equal target weights across all positions.', 'info');
  };

  // Quick Action: Normalize
  const handleNormalize = () => {
    if (activeTickers.length === 0) return;
    const normalized = normalizeTargets(targetAllocations);
    onUpdateTargetAllocations(activePortfolio.id, normalized);
    showNotification('Normalized targets to 100.00%.', 'info');
  };

  // Quick Action: Clear
  const handleClearTargets = () => {
    onUpdateTargetAllocations(activePortfolio.id, {});
    showNotification('Cleared target allocations.', 'info');
  };

  // Calculate rebalancing trade proposals in base currency
  const rebalanceResult = useMemo(() => {
    if (rebalanceMode === 'full') {
      return computeFullRebalance(holdings, targetAllocations, stocks, undefined, baseCurrency, fxRate);
    } else {
      return computeDepositRebalance(holdings, targetAllocations, stocks, depositAmount, undefined, baseCurrency, fxRate);
    }
  }, [rebalanceMode, holdings, targetAllocations, stocks, depositAmount, baseCurrency, fxRate]);

  // Execute Rebalance Action
  const handleExecute = async () => {
    if (!rebalanceResult.orders || rebalanceResult.orders.length === 0) {
      showNotification('No rebalancing orders to execute. Portfolio is already balanced.', 'info');
      return;
    }

    if (Math.abs(totalTargetPct - 100) > 0.05) {
      const confirmProceed = confirm(
        `Your target allocation total is currently ${totalTargetPct}%, which does not equal 100%.\nDo you still want to execute rebalancing with current ratios?`
      );
      if (!confirmProceed) return;
    }

    const orderCount = rebalanceResult.orders.length;
    const confirmExec = confirm(
      `Execute all ${orderCount} rebalance order${orderCount === 1 ? '' : 's'} at current market price estimates?\n\nTip: You can also click 'Fill in Form' on individual orders to adjust actual broker execution prices.`
    );
    if (!confirmExec) return;

    setIsExecuting(true);
    try {
      await onExecuteRebalance(activePortfolio.id, rebalanceResult.orders);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleCopyPlan = () => {
    if (!rebalanceResult.orders || rebalanceResult.orders.length === 0) {
      showNotification('No rebalance orders to copy.', 'info');
      return;
    }
    const header = `AetherTrade Rebalance Plan — ${activePortfolio?.name || 'Portfolio'} (${rebalanceMode === 'full' ? 'Full Rebalance' : `Deposit ${formatMoney(depositAmount, baseCurrency)}`}):`;
    const lines = rebalanceResult.orders.map(ord => {
      const ordCurr = detectTickerCurrency(ord.ticker);
      return `• ${ord.type} ${parseFloat(Number(ord.shares || 0).toFixed(4))} ${ord.ticker} @ ${formatMoney(ord.price, ordCurr)} (~${formatMoney(ord.total, ordCurr)}) [${ord.currentWeight.toFixed(1)}% ➜ ${ord.targetWeight.toFixed(1)}%]`;
    });
    const text = [header, ...lines].join('\n');

    navigator.clipboard.writeText(text)
      .then(() => showNotification('Rebalance plan copied to clipboard! Ready to paste into your broker.', 'success'))
      .catch(() => showNotification('Could not access clipboard.', 'error'));
  };

  const handlePrefillOrder = (ord) => {
    if (onPrefillTrade) {
      onPrefillTrade({
        ticker: ord.ticker,
        type: ord.type,
        shares: ord.shares,
        price: ord.price,
        account: activePortfolio?.name || 'Primary Portfolio'
      });
      showNotification(`Pre-filled ${ord.type} ${ord.ticker} into Record Trade form. You can adjust the exact fill price!`, 'info');
    }
  };

  const handleQuickLogOrder = async (ord) => {
    if (onAddTransaction) {
      try {
        const ordCurr = detectTickerCurrency(ord.ticker);
        const saved = await onAddTransaction(activePortfolio?.id, {
          ticker: ord.ticker,
          type: ord.type,
          shares: ord.shares,
          price: ord.price,
          fees: 0,
          account: activePortfolio?.name || 'Primary Portfolio',
          timestamp: Date.now()
        });
        if (!saved) return;
        showNotification(`Logged ${ord.type} ${parseFloat(Number(ord.shares || 0).toFixed(4))} ${ord.ticker} at ${formatMoney(ord.price, ordCurr)}`, 'success');
      } catch (err) {
        showNotification(`Failed to log trade: ${err.message}`, 'error');
      }
    }
  };

  return (
    <div className="rebalance-studio-container rebalance-workspace" aria-label="Target Strategy & Rebalance Studio">
      <div className="rebalance-targets-section">
        <div className="section-subtitle rebalance-studio-header">
          <div className="rebalance-step-heading"><span className="studio-step">1</span><div><h4 className="studio-title">Target allocation</h4><p>Choose the share of your portfolio for each asset.</p></div></div>

          <div className="target-tools-cluster">
            <button
              type="button"
              onClick={handleEqualSplit}
              className="btn-target-tool"
              title="Distribute 100% equally across all assets"
            >
              <i className="fa-solid fa-arrows-split-up-and-left"></i>
              <span>Equal Split</span>
            </button>
            <button
              type="button"
              onClick={handleNormalize}
              className="btn-target-tool"
              title="Scale target weights to sum to 100%"
            >
              <i className="fa-solid fa-scale-balanced"></i>
              <span>Normalize</span>
            </button>
            <button
              type="button"
              onClick={handleClearTargets}
              className="btn-target-tool btn-target-clear"
              title="Clear all target weights"
            >
              <i className="fa-solid fa-eraser" aria-hidden="true"></i><span>Clear weights</span>
            </button>
          </div>
        </div>

        <div className={`rebalance-allocation-summary ${Math.abs(totalTargetPct - 100) <= 0.05 ? 'balanced' : 'incomplete'}`}>
          <div><span>Targets allocated</span><strong className="tabular-nums">{totalTargetPct.toFixed(1)}% <small>/ 100%</small></strong></div>
          <progress aria-label="Total target allocation" value={Math.min(100, totalTargetPct)} max="100" />
          <p>{Math.abs(totalTargetPct - 100) <= 0.05 ? 'Your target weights are fully allocated.' : totalTargetPct < 100 ? `${(100 - totalTargetPct).toFixed(1)}% left to allocate.` : `${(totalTargetPct - 100).toFixed(1)}% over the target total. Adjust or normalize your weights.`}</p>
        </div>

        {untargetedHeldCount > 0 && rebalanceMode === 'full' && (
          <div className="studio-warning-alert">
            <i className="fa-solid fa-triangle-exclamation"></i>
            <span>
              <strong>Note:</strong> {untargetedHeldCount} held {untargetedHeldCount === 1 ? 'position has' : 'positions have'} no target percentage and will be fully sold in Full Rebalance mode.
            </span>
          </div>
        )}

        {activeTickers.length === 0 ? (
          <div className="empty-allocation-card">
            <i className="fa-solid fa-bullseye empty-donut-icon"></i>
            <span className="empty-title">No Active Holdings</span>
            <span className="empty-desc">Record transactions or add assets to configure strategic target ratios.</span>
          </div>
        ) : (
          <div className="target-matrix-list">
            {activeTickers.map(ticker => {
              const nativePrice = resolveAssetPrice(ticker, holdings, stocks);
              const shares = holdings[ticker]?.shares || 0;
              const nativeVal = shares * nativePrice;
              const tickerCurr = detectTickerCurrency(ticker);
              const baseVal = convertCurrency(nativeVal, tickerCurr, baseCurrency, fxRate);
              const actualWeight = totalAssetValue > 0 ? (baseVal / totalAssetValue) * 100 : 0;
              const targetWeight = parseFloat(targetAllocations[ticker]) || 0;
              const { driftPct, status } = calculateDrift(actualWeight, targetWeight);

              return (
                <div key={ticker} className="target-matrix-row">
                  <div className="matrix-col-asset"><AssetMark ticker={ticker} /><div className="target-asset-description">
                    <div className="matrix-ticker-group">
                      <span className="matrix-ticker">{ticker}</span>
                      <span className="matrix-name">{stocks[ticker]?.name || `${ticker} Stock`}</span>
                    </div>
                    <div className="matrix-val-sub tabular-nums">
                      <strong>{formatMoney(baseVal, baseCurrency)}</strong><span>{parseFloat(Number(shares || 0).toFixed(4))} shares at {formatMoney(nativePrice, tickerCurr)}</span>
                    </div>
                  </div>

                  </div>
                  <div className="matrix-col-drift">
                    <div className="matrix-weight-compare tabular-nums">
                      <span className="actual-weight-tag">Current <strong>{actualWeight.toFixed(1)}%</strong></span>
                      <span className={`drift-badge ${status}`}>
                        {status === 'overweight' && <i className="fa-solid fa-arrow-up"></i>}
                        {status === 'underweight' && <i className="fa-solid fa-arrow-down"></i>}
                        {status === 'balanced' && <i className="fa-solid fa-check"></i>}
                        {driftPct > 0 ? `+${driftPct.toFixed(1)}%` : `${driftPct.toFixed(1)}%`}
                      </span>
                    </div>
                    <div className="matrix-progress-track">
                      <div
                        className="matrix-actual-fill"
                        style={{ width: `${Math.min(100, actualWeight)}%` }}
                        title={`Actual Weight: ${actualWeight.toFixed(1)}%`}
                      ></div>
                      {targetWeight > 0 && (
                        <div
                          className="matrix-target-marker"
                          style={{ left: `${Math.min(100, targetWeight)}%` }}
                          title={`Target Weight: ${targetWeight.toFixed(1)}%`}
                        ></div>
                      )}
                    </div>
                  </div>

                  <div className="matrix-col-input">
                    <label className="target-input-label"><span>Target weight</span><div className="target-input-wrapper">
                      <input
                        aria-label={`Target weight for ${ticker}`}
                        type="number"
                        min="0"
                        max="100"
                        step="any"
                        value={targetAllocations[ticker] ?? ''}
                        onChange={(e) => handleTargetChange(ticker, e.target.value)}
                        onFocus={(e) => e.target.select()}
                        onWheel={(e) => e.currentTarget.blur()}
                        placeholder="0"
                        className="target-pct-input tabular-nums"
                      />
                      <span className="target-suffix">%</span>
                    </div></label>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rebalance-action-section">
        <div className="section-subtitle rebalance-studio-header">
          <div className="rebalance-step-heading"><span className="studio-step">2</span><div><h4 className="studio-title">Review your orders</h4><p>{rebalanceMode === 'full' ? 'Adjust existing positions toward your targets.' : 'Put new cash toward your target weights.'}</p></div></div>
          <SegmentedControl label="Rebalance mode" value={rebalanceMode} onChange={setRebalanceMode} options={[{ value: 'full', label: 'Full rebalance' }, { value: 'deposit', label: 'Add cash' }]} />
        </div>

        {rebalanceMode === 'deposit' && (
          <div className="deposit-config-card">
            <div className="deposit-input-row">
              <label className="deposit-label" htmlFor="rebalanceDeposit">Cash to invest <small>{baseCurrency}</small></label>
              <div className="deposit-field-wrapper">
                <span className="field-prefix">{getCurrencySymbol(baseCurrency)}</span>
                <input
                  id="rebalanceDeposit"
                  type="number"
                  min="1"
                  step="10"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="deposit-cash-input tabular-nums"
                  placeholder="1000"
                />
              </div>
            </div>
            {/* Quick Deposit Increment Chips */}
            <div className="deposit-chips-row">
              <span className="deposit-chips-label">Quick Presets:</span>
              {[100, 250, 500, 1000, 2500, 5000].map(amt => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setDepositAmount(amt)}
                  className={`deposit-preset-chip ${depositAmount === amt ? 'active' : ''}`}
                >
                  +{getCurrencySymbol(baseCurrency)}{amt >= 1000 ? `${amt / 1000}k` : amt}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="rebalance-orders-card">
          <div className="orders-summary-bar">
            <div className="orders-summary-left">
              <span className="orders-count-badge tabular-nums">
                {rebalanceResult.orders.length} {rebalanceResult.orders.length === 1 ? 'Order' : 'Orders'} Proposed
              </span>
              <dl className="rebalance-plan-totals">
                {rebalanceMode === 'full' ? <><div><dt>Proposed sells</dt><dd className="text-red tabular-nums">{formatMoney(rebalanceResult.totalSells, baseCurrency)}</dd></div><div><dt>Proposed buys</dt><dd className="text-green tabular-nums">{formatMoney(rebalanceResult.totalBuys, baseCurrency)}</dd></div></> : <><div><dt>Cash allocated</dt><dd className="text-green tabular-nums">{formatMoney(rebalanceResult.totalBuys, baseCurrency)}</dd></div><div><dt>Cash remaining</dt><dd className="tabular-nums">{formatMoney(rebalanceResult.cashRemaining, baseCurrency)}</dd></div></>}
              </dl>
            </div>

            <div className="orders-summary-actions">
              <button
                type="button"
                onClick={handleCopyPlan}
                disabled={rebalanceResult.orders.length === 0}
                className="btn-copy-plan"
                title="Copy order plan to clipboard"
              >
                <i className="fa-solid fa-copy"></i>
                <span>Copy Plan</span>
              </button>

              <button
                type="button"
                onClick={handleExecute}
                disabled={isExecuting || rebalanceResult.orders.length === 0}
                className="btn-execute-rebalance"
                title="Execute all proposed rebalancing trades at market estimate"
              >
                {isExecuting ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin"></i>
                    <span>Executing...</span>
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-bolt"></i>
                    <span>Execute All ({rebalanceResult.orders.length})</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {rebalanceResult.orders.length === 0 ? (
            <div className="empty-orders-msg">
              <i className="fa-solid fa-circle-check text-green"></i>
              <span>Your portfolio is already aligned with your target strategy. No rebalancing trades needed!</span>
            </div>
          ) : (
            <div className="rebalance-orders-list">
              {rebalanceResult.orders.map((ord, idx) => {
                const isBuy = ord.type === 'BUY';
                const ordCurr = detectTickerCurrency(ord.ticker);
                return (
                  <div key={`${ord.ticker}-${ord.type}-${idx}`} className="rebalance-order-item">
                    <div className="order-left">
                      <span className={`order-type-badge ${isBuy ? 'buy' : 'sell'}`}>
                        {ord.type}
                      </span>
                      <div className="order-ticker-group">
                        <span className="order-ticker">{ord.ticker}</span>
                        <span className="order-shares-desc tabular-nums">
                          {parseFloat(Number(ord.shares || 0).toFixed(4))} sh @ {formatMoney(ord.price, ordCurr)}
                        </span>
                      </div>
                    </div>

                    <div className="order-center-metric">
                      <span className={`order-total tabular-nums ${isBuy ? 'text-green' : 'text-red'}`}>
                        {isBuy ? '+' : '-'}{formatMoney(ord.total, ordCurr)}
                      </span>
                      <span className="order-weight-transition tabular-nums">
                        {ord.currentWeight.toFixed(1)}% ➜ {ord.targetWeight.toFixed(1)}%
                      </span>
                    </div>

                    <div className="order-actions-cluster">
                      <button
                        type="button"
                        onClick={() => handlePrefillOrder(ord)}
                        className="btn-order-action fill"
                        title={`Pre-fill ${ord.type} ${ord.ticker} in Record Trade form to adjust exact execution price`}
                      >
                        <i className="fa-solid fa-pen-to-square"></i>
                        <span>Review entry</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickLogOrder(ord)}
                        className="btn-order-action quick"
                        title={`Quick-log ${ord.type} ${ord.ticker} immediately at market estimate (${formatMoney(ord.price, ordCurr)})`}
                      >
                        <i className="fa-solid fa-bolt"></i>
                        <span>Record</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
