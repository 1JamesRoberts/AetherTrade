import { useState, useMemo } from 'react';
import {
  calculateEqualSplit,
  normalizeTargets,
  calculateDrift,
  resolveAssetPrice,
  computeFullRebalance,
  computeDepositRebalance
} from '../utils/rebalanceUtils';

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

  const holdings = useMemo(() => activePortfolio.holdings || {}, [activePortfolio.holdings]);
  const targetAllocations = useMemo(() => activePortfolio.targetAllocations || {}, [activePortfolio.targetAllocations]);

  // All relevant tickers: held stocks + any custom targeted tickers
  const activeTickers = useMemo(() => {
    const held = Object.keys(holdings).filter(t => (holdings[t]?.shares || 0) > 0);
    const targeted = Object.keys(targetAllocations).filter(t => (parseFloat(targetAllocations[t]) || 0) > 0);
    return Array.from(new Set([...held, ...targeted])).sort();
  }, [holdings, targetAllocations]);

  // Compute total asset value
  const totalAssetValue = useMemo(() => {
    return activeTickers.reduce((acc, ticker) => {
      const price = resolveAssetPrice(ticker, holdings, stocks);
      const shares = holdings[ticker]?.shares || 0;
      return acc + (shares * price);
    }, 0);
  }, [activeTickers, holdings, stocks]);

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

  // Calculate rebalancing trade proposals
  const rebalanceResult = useMemo(() => {
    if (rebalanceMode === 'full') {
      return computeFullRebalance(holdings, targetAllocations, stocks);
    } else {
      return computeDepositRebalance(holdings, targetAllocations, stocks, depositAmount);
    }
  }, [rebalanceMode, holdings, targetAllocations, stocks, depositAmount]);

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
    const header = `AetherTrade Rebalance Plan — ${activePortfolio.name} (${rebalanceMode === 'full' ? 'Full Rebalance' : `Deposit $${depositAmount}`}):`;
    const lines = rebalanceResult.orders.map(ord => {
      return `• ${ord.type} ${parseFloat(ord.shares.toFixed(4))} ${ord.ticker} @ $${ord.price.toFixed(2)} (~$${ord.total.toFixed(2)}) [${ord.currentWeight.toFixed(1)}% ➜ ${ord.targetWeight.toFixed(1)}%]`;
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
        account: activePortfolio.name
      });
      showNotification(`Pre-filled ${ord.type} ${ord.ticker} into Record Trade form. You can adjust the exact fill price!`, 'info');
    }
  };

  const handleQuickLogOrder = async (ord) => {
    if (onAddTransaction) {
      try {
        await onAddTransaction(activePortfolio.id, {
          ticker: ord.ticker,
          type: ord.type,
          shares: ord.shares,
          price: ord.price,
          fees: 0,
          account: activePortfolio.name,
          timestamp: Date.now()
        });
        showNotification(`Logged ${ord.type} ${parseFloat(ord.shares.toFixed(4))} ${ord.ticker} at $${ord.price.toFixed(2)}`, 'success');
      } catch (err) {
        showNotification(`Failed to log trade: ${err.message}`, 'error');
      }
    }
  };

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0);
  };

  return (
    <div className="rebalance-studio-container" aria-label="Target Strategy & Rebalance Studio">
      <div className="rebalance-targets-section">
        <div className="section-subtitle rebalance-studio-header">
          <div className="rebalance-header-title-group">
            <span className="studio-title">Target Asset Allocation</span>
            <span
              className={`target-status-pill ${
                Math.abs(totalTargetPct - 100) <= 0.05
                  ? 'balanced'
                  : totalTargetPct < 100
                  ? 'under'
                  : 'over'
              }`}
            >
              {Math.abs(totalTargetPct - 100) <= 0.05 ? (
                <>
                  <i className="fa-solid fa-circle-check"></i> 100% Allocated
                </>
              ) : totalTargetPct < 100 ? (
                <>
                  <i className="fa-solid fa-circle-exclamation"></i> {totalTargetPct.toFixed(1)}% / 100% ({(100 - totalTargetPct).toFixed(1)}% Left)
                </>
              ) : (
                <>
                  <i className="fa-solid fa-triangle-exclamation"></i> {totalTargetPct.toFixed(1)}% / 100% (+{(totalTargetPct - 100).toFixed(1)}% Over)
                </>
              )}
            </span>
          </div>

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
              <i className="fa-solid fa-eraser"></i>
            </button>
          </div>
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
              const price = resolveAssetPrice(ticker, holdings, stocks);
              const shares = holdings[ticker]?.shares || 0;
              const val = shares * price;
              const actualWeight = totalAssetValue > 0 ? (val / totalAssetValue) * 100 : 0;
              const targetWeight = parseFloat(targetAllocations[ticker]) || 0;
              const { driftPct, status } = calculateDrift(actualWeight, targetWeight);

              return (
                <div key={ticker} className="target-matrix-row">
                  <div className="matrix-col-asset">
                    <div className="matrix-ticker-group">
                      <span className="matrix-ticker">{ticker}</span>
                      <span className="matrix-name">{stocks[ticker]?.name || `${ticker} Stock`}</span>
                    </div>
                    <div className="matrix-val-sub tabular-nums">
                      {formatCurrency(val)} ({parseFloat(shares.toFixed(4))} sh @ {formatCurrency(price)})
                    </div>
                  </div>

                  <div className="matrix-col-drift">
                    <div className="matrix-weight-compare tabular-nums">
                      <span className="actual-weight-tag">Actual: {actualWeight.toFixed(1)}%</span>
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
                    <div className="target-input-wrapper">
                      <input
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
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rebalance-action-section">
        <div className="section-subtitle rebalance-studio-header">
          <span className="studio-title">Rebalancing Engine</span>
          <div className="rebalance-mode-pill-group">
            <button
              type="button"
              onClick={() => setRebalanceMode('full')}
              className={`rebalance-mode-pill ${rebalanceMode === 'full' ? 'active' : ''}`}
            >
              <i className="fa-solid fa-rotate"></i>
              <span>Full Rebalance</span>
            </button>
            <button
              type="button"
              onClick={() => setRebalanceMode('deposit')}
              className={`rebalance-mode-pill ${rebalanceMode === 'deposit' ? 'active' : ''}`}
            >
              <i className="fa-solid fa-money-bill-wave"></i>
              <span>Deposit Rebalance</span>
            </button>
          </div>
        </div>

        {rebalanceMode === 'deposit' && (
          <div className="deposit-config-card">
            <div className="deposit-input-row">
              <span className="deposit-label">Deposit Cash Amount:</span>
              <div className="deposit-field-wrapper">
                <span className="field-prefix">$</span>
                <input
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
                  +${amt >= 1000 ? `${amt / 1000}k` : amt}
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
              {rebalanceMode === 'full' ? (
                <span className="orders-stat-sub tabular-nums">
                  Sells: <strong className="text-red">{formatCurrency(rebalanceResult.totalSells)}</strong> | Buys: <strong className="text-green">{formatCurrency(rebalanceResult.totalBuys)}</strong>
                </span>
              ) : (
                <span className="orders-stat-sub tabular-nums">
                  Allocated: <strong className="text-green">{formatCurrency(rebalanceResult.totalBuys)}</strong> / {formatCurrency(depositAmount)} (Left: {formatCurrency(rebalanceResult.cashRemaining)})
                </span>
              )}
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
                return (
                  <div key={`${ord.ticker}-${ord.type}-${idx}`} className="rebalance-order-item">
                    <div className="order-left">
                      <span className={`order-type-badge ${isBuy ? 'buy' : 'sell'}`}>
                        {ord.type}
                      </span>
                      <div className="order-ticker-group">
                        <span className="order-ticker">{ord.ticker}</span>
                        <span className="order-shares-desc tabular-nums">
                          {parseFloat(ord.shares.toFixed(4))} sh @ {formatCurrency(ord.price)}
                        </span>
                      </div>
                    </div>

                    <div className="order-center-metric">
                      <span className={`order-total tabular-nums ${isBuy ? 'text-green' : 'text-red'}`}>
                        {isBuy ? '+' : '-'}{formatCurrency(ord.total)}
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
                        <span>Fill in Form</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickLogOrder(ord)}
                        className="btn-order-action quick"
                        title={`Quick-log ${ord.type} ${ord.ticker} immediately at market estimate ($${ord.price.toFixed(2)})`}
                      >
                        <i className="fa-solid fa-bolt"></i>
                        <span>Log</span>
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
