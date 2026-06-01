// ==========================================================================
// PORTFOLIO MODULE (portfolio.js)
// Houses transaction execution, portfolio selectors, dashboard updates, and reconstruction logic
// ==========================================================================

import {
  state,
  portfolioState,
  portfoliosList,
  activePortfolioId,
  setActivePortfolioId,
  setPortfoliosList,
  savePortfolioToStorage,
  saveCachedStocks,
  showNotification,
  STOCKS_METADATA
} from './state.js';

import {
  renderAllocationChart,
  renderPerformanceChart
} from './charts.js';

import {
  renderStockList
} from '../app.js';

import {
  loadPortfolioHistory
} from './api.js';

// Format currency helper
export function formatCurrency(val) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
}

// Populate the portfolio dropdown selector dynamically
export function updatePortfolioSelectorDropdown() {
  const selector = document.getElementById('portfolioSelector');
  if (!selector) return;

  selector.innerHTML = '';
  portfoliosList.forEach(p => {
    const option = document.createElement('option');
    option.value = p.id;
    option.textContent = p.name;
    option.selected = (p.id === activePortfolioId);
    selector.appendChild(option);
  });
}

// Complete chronological reconstruction of holdings and realized P&L based on transactions
export function rebuildPortfolioFromTransactions() {
  const active = portfoliosList.find(p => p.id === activePortfolioId);
  if (active) {
    active.transactions = portfolioState.transactions;
    rebuildSpecificPortfolio(active);
    portfolioState.holdings = active.holdings;
    portfolioState.realizedPL = active.realizedPL;
  }

  savePortfolioToStorage();
  updatePortfolioDashboard();
}

// Chronological reconstruction of holdings and realized P&L for a specific portfolio object
export function rebuildSpecificPortfolio(port) {
  port.transactions.sort((a, b) => a.timestamp - b.timestamp);

  const newHoldings = {};
  let newRealizedPL = 0;

  port.transactions.forEach(tx => {
    const ticker = tx.ticker;
    const txFees = parseFloat(tx.fees) || 0;

    if (tx.type === 'BUY') {
      if (!newHoldings[ticker]) {
        newHoldings[ticker] = { shares: 0, avgCost: 0, totalFees: 0 };
      }
      const existing = newHoldings[ticker];
      const newPureTotalCost = (existing.shares * existing.avgCost) + (tx.shares * tx.price);
      existing.shares += tx.shares;
      existing.avgCost = existing.shares > 0 ? (newPureTotalCost / existing.shares) : 0;
      existing.totalFees = (existing.totalFees || 0) + txFees;
    } else {
      if (newHoldings[ticker]) {
        const existing = newHoldings[ticker];
        const txRealized = tx.shares * (tx.price - existing.avgCost) - txFees;
        newRealizedPL += txRealized;

        const originalShares = existing.shares;
        existing.shares = Math.max(0, existing.shares - tx.shares);
        
        if (originalShares > 0) {
          existing.totalFees = existing.shares * ((existing.totalFees || 0) / originalShares);
        } else {
          existing.totalFees = 0;
        }

        if (existing.shares < 1e-9) {
          delete newHoldings[ticker];
        }
      }
    }
  });

  port.holdings = newHoldings;
  port.realizedPL = newRealizedPL;
}

// Calculate unrealized gain/loss and details for each holding, then update UI
export function updatePortfolioDashboard() {
  const tableBody = document.getElementById('portfolioTableBody');
  const emptyState = document.getElementById('emptyPortfolioState');
  const allocationContainer = document.getElementById('portfolioAllocationContainer');
  const logList = document.getElementById('portfolioLogList');

  if (!tableBody || !allocationContainer || !logList) return;

  tableBody.innerHTML = '';
  allocationContainer.innerHTML = '';
  logList.innerHTML = '';

  let totalAssetValue = 0;
  let totalCostBasis = 0;

  // Render Active Holdings rows sorted in descending order of current market value
  const holdingTickers = Object.keys(portfolioState.holdings).sort((a, b) => {
    const holdingA = portfolioState.holdings[a];
    const metadataA = state.stocks[a] || STOCKS_METADATA.find(s => s.ticker === a) || { price: holdingA.avgCost };
    const currentPriceA = metadataA.price || holdingA.avgCost;
    const marketValueA = holdingA.shares * currentPriceA;

    const holdingB = portfolioState.holdings[b];
    const metadataB = state.stocks[b] || STOCKS_METADATA.find(s => s.ticker === b) || { price: holdingB.avgCost };
    const currentPriceB = metadataB.price || holdingB.avgCost;
    const marketValueB = holdingB.shares * currentPriceB;

    return marketValueB - marketValueA;
  });

  if (holdingTickers.length === 0) {
    if (emptyState) emptyState.style.display = 'flex';
    const portfolioTable = document.getElementById('portfolioTable');
    if (portfolioTable) portfolioTable.style.display = 'none';
  } else {
    if (emptyState) emptyState.style.display = 'none';
    const portfolioTable = document.getElementById('portfolioTable');
    if (portfolioTable) portfolioTable.style.display = 'table';

    holdingTickers.forEach(ticker => {
      const holding = portfolioState.holdings[ticker];
      const metadata = state.stocks[ticker] || STOCKS_METADATA.find(s => s.ticker === ticker) || { price: holding.avgCost, change: 0, name: ticker + ' Stock' };
      const currentPrice = metadata.price || holding.avgCost; // Fallback to avgCost if not loaded yet

      const totalCost = (holding.shares * holding.avgCost) + (holding.totalFees || 0);
      const marketValue = holding.shares * currentPrice;
      const pnlVal = marketValue - totalCost;
      const pnlPct = totalCost > 0 ? (pnlVal / totalCost) * 100 : 0;

      totalAssetValue += marketValue;
      totalCostBasis += totalCost;

      const isProfit = pnlVal >= 0;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight: 800; font-family: var(--font-display); color: var(--cyan);">${ticker} <span style="font-size: 10px; color: var(--text-muted); font-weight: 400; display: block;">${metadata.name || ''}</span></td>
        <td style="font-weight: 700;">${parseFloat(Number(holding.shares).toFixed(6))}</td>
        <td>${formatCurrency(holding.avgCost)}</td>
        <td style="font-weight: 700; color: #fff;">${formatCurrency(currentPrice)}</td>
        <td>${formatCurrency(totalCost)}</td>
        <td style="font-weight: 700; color: var(--cyan);">${formatCurrency(marketValue)}</td>
        <td style="font-weight: 700; color: ${isProfit ? 'var(--bullish)' : 'var(--bearish)'};">
          ${isProfit ? '+' : ''}${formatCurrency(pnlVal)}
          <span style="font-size: 10px; display: block; font-weight: 500;">(${isProfit ? '+' : ''}${pnlPct.toFixed(2)}%)</span>
        </td>
        <td style="text-align: center;">
          <button class="btn btn-tx-sell-all" data-ticker="${ticker}" style="background: rgba(244, 63, 94, 0.1); border: 1px solid rgba(244, 63, 94, 0.2); color: var(--bearish); padding: 4px 8px; font-size: 10px; border-radius: 4px; cursor: pointer; transition: all var(--transition-fast);">
            Sell All
          </button>
        </td>
      `;

      // Bind Sell All Action
      tr.querySelector('.btn-tx-sell-all').onclick = () => {
        executeTransaction(ticker, 'SELL', holding.shares, currentPrice);
      };

      tableBody.appendChild(tr);
    });
  }

  // Overall Portfolio Summary Computations
  const netProfit = totalAssetValue - totalCostBasis;
  const netReturnPct = totalCostBasis > 0 ? (netProfit / totalCostBasis) * 100 : 0;

  const portMarketValEl = document.getElementById('portMarketVal');
  if (portMarketValEl) portMarketValEl.innerText = formatCurrency(totalAssetValue);

  const portCostBasisEl = document.getElementById('portCostBasis');
  if (portCostBasisEl) portCostBasisEl.innerText = formatCurrency(totalCostBasis);

  // Update Realized Profit / Loss summary card
  const realizedPLEl = document.getElementById('portRealizedPL');
  if (realizedPLEl) {
    const rPL = portfolioState.realizedPL || 0;
    const rIsPositive = rPL >= 0;
    realizedPLEl.innerText = `${rIsPositive ? '+' : ''}${formatCurrency(rPL)}`;
    realizedPLEl.className = `metric-val ${rPL === 0 ? '' : (rIsPositive ? 'text-green' : 'text-red')}`;

    const realizedCard = document.getElementById('portRealizedCard');
    if (realizedCard) {
      if (rPL > 0) {
        realizedCard.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        realizedCard.style.background = 'rgba(16, 185, 129, 0.01)';
      } else if (rPL < 0) {
        realizedCard.style.borderColor = 'rgba(244, 63, 94, 0.3)';
        realizedCard.style.background = 'rgba(244, 63, 94, 0.01)';
      } else {
        realizedCard.style.borderColor = 'var(--border-color)';
        realizedCard.style.background = 'rgba(255, 255, 255, 0.02)';
      }
    }
  }

  const profitLossEl = document.getElementById('portProfitLoss');
  if (profitLossEl) {
    const returnIsPositive = netProfit >= 0;
    profitLossEl.innerText = `${returnIsPositive ? '+' : ''}${formatCurrency(netProfit)}`;
    profitLossEl.className = `metric-val ${returnIsPositive ? 'text-green' : 'text-red'}`;
  }

  // Highlight positive/negative returns on summary card border glow
  const profitCard = document.getElementById('portProfitCard');
  if (profitCard) {
    if (netProfit > 0) {
      profitCard.style.borderColor = 'rgba(16, 185, 129, 0.3)';
      profitCard.style.background = 'rgba(16, 185, 129, 0.01)';
    } else if (netProfit < 0) {
      profitCard.style.borderColor = 'rgba(244, 63, 94, 0.3)';
      profitCard.style.background = 'rgba(244, 63, 94, 0.01)';
    } else {
      profitCard.style.borderColor = 'var(--border-color)';
      profitCard.style.background = 'rgba(255, 255, 255, 0.02)';
    }
  }

  const returnEl = document.getElementById('portReturnPct');
  if (returnEl) {
    const returnIsPositive = netProfit >= 0;
    returnEl.innerText = `${returnIsPositive ? '+' : ''}${netReturnPct.toFixed(2)}%`;
    returnEl.className = `metric-val ${returnIsPositive ? 'text-green' : 'text-red'}`;
  }

  const returnCard = document.getElementById('portReturnCard');
  if (returnCard) {
    if (netProfit > 0) {
      returnCard.style.borderColor = 'rgba(16, 185, 129, 0.3)';
      returnCard.style.background = 'rgba(16, 185, 129, 0.01)';
    } else if (netProfit < 0) {
      returnCard.style.borderColor = 'rgba(244, 63, 94, 0.3)';
      returnCard.style.background = 'rgba(244, 63, 94, 0.01)';
    } else {
      returnCard.style.borderColor = 'var(--border-color)';
      returnCard.style.background = 'rgba(255, 255, 255, 0.02)';
    }
  }

  // Render Allocation progress bars
  if (holdingTickers.length === 0) {
    allocationContainer.innerHTML = `<div class="empty-pill-msg" style="text-align: center; margin-top: 20px;">No holdings active yet. Record a transaction to view allocation distribution.</div>`;
  } else {
    holdingTickers.forEach(ticker => {
      const holding = portfolioState.holdings[ticker];
      const metadata = state.stocks[ticker] || STOCKS_METADATA.find(s => s.ticker === ticker) || { price: holding.avgCost };
      const currentPrice = metadata.price || holding.avgCost;
      const marketValue = holding.shares * currentPrice;
      const allocationPct = totalAssetValue > 0 ? (marketValue / totalAssetValue) * 100 : 0;

      const barWrapper = document.createElement('div');
      barWrapper.className = 'allocation-bar-wrapper';
      barWrapper.innerHTML = `
        <div class="allocation-bar-header">
          <span class="allocation-bar-ticker">${ticker}</span>
          <span style="font-size: 11px; color: var(--text-muted);">${parseFloat(Number(holding.shares).toFixed(6))} shares @ ${formatCurrency(currentPrice)}</span>
          <span class="allocation-bar-pct">${allocationPct.toFixed(1)}%</span>
        </div>
        <div class="allocation-bar-track">
          <div class="allocation-bar-fill" style="width: ${allocationPct}%"></div>
        </div>
      `;
      allocationContainer.appendChild(barWrapper);
    });
  }

  // Trigger Pie/Donut Chart Allocation Rendering
  renderAllocationChart(holdingTickers, totalAssetValue);

  // Trigger Unrealized Performance Chart Rendering
  renderPerformanceChart();

  // Render Transaction Logs
  if (portfolioState.transactions.length === 0) {
    logList.innerHTML = `<li class="empty-pill-msg" style="text-align: center; padding-top: 15px;">No transactions recorded.</li>`;
  } else {
    // Show newest first
    const reversedTx = [...portfolioState.transactions].reverse();
    reversedTx.forEach((tx, idx) => {
      const li = document.createElement('li');
      li.className = 'tx-log-item';

      const txDate = new Date(tx.timestamp);
      const isMidnight = txDate.getHours() === 0 && txDate.getMinutes() === 0 && txDate.getSeconds() === 0 && txDate.getMilliseconds() === 0;
      const dateStr = isMidnight
        ? txDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
        : txDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + txDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      const txFees = parseFloat(tx.fees) || 0;
      const txAccount = tx.account || 'Default';
      const feesStr = txFees > 0 ? ` | Fee: ${formatCurrency(txFees)}` : '';
      const accountStr = txAccount !== 'Default' ? ` | Account: ${txAccount}` : '';

      li.innerHTML = `
        <div>
          <span class="type-badge ${tx.type.toLowerCase()}">${tx.type}</span>
          <strong>${parseFloat(Number(tx.shares).toFixed(6))} ${tx.ticker}</strong> @ ${formatCurrency(tx.price)}
          <span style="font-size: 10px; color: var(--text-muted); display: block; margin-top: 2px;">
            Gross: ${formatCurrency(tx.shares * tx.price)}${feesStr}${accountStr}
          </span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="tx-time">${dateStr}</span>
          <button class="btn-tx-delete" data-index="${portfolioState.transactions.length - 1 - idx}" title="Delete transaction entry"><i class="fa-solid fa-xmark"></i></button>
        </div>
      `;

      li.querySelector('.btn-tx-delete').onclick = (e) => {
        const deleteIdx = parseInt(e.currentTarget.getAttribute('data-index'));
        deleteTransactionEntry(deleteIdx);
      };

      logList.appendChild(li);
    });
  }
}

// Delete transaction log entry and recalculate (reverts transaction)
export function deleteTransactionEntry(index) {
  const tx = portfolioState.transactions[index];
  if (!tx) return;

  const confirmRevert = confirm(`Do you want to delete this transaction entry? This will revert its effect on your holdings.`);
  if (!confirmRevert) return;

  // Reconstruct holdings from remaining transactions list
  reconstructHoldingsFromTx(index);
}

export function reconstructHoldingsFromTx(removeIndex) {
  portfolioState.transactions.splice(removeIndex, 1);
  rebuildPortfolioFromTransactions();
}

// Create a new named portfolio
export function createNewPortfolio(name) {
  if (!name || name.trim() === '') return;
  const cleanName = name.trim();
  
  // Check if name already exists to prevent duplicate names
  if (portfoliosList.some(p => p.name.toLowerCase() === cleanName.toLowerCase())) {
    showNotification(`A portfolio named "${cleanName}" already exists!`, 'error');
    return;
  }

  const newId = 'portfolio_' + Date.now();
  const newPortfolio = {
    id: newId,
    name: cleanName,
    holdings: {},
    transactions: [],
    realizedPL: 0
  };

  portfoliosList.push(newPortfolio);
  setActivePortfolioId(newId);

  // Sync to active state
  portfolioState.holdings = {};
  portfolioState.transactions = [];
  portfolioState.realizedPL = 0;
  portfolioState.selectedTicker = null;

  savePortfolioToStorage();
  
  // Re-render UI
  updatePortfolioSelectorDropdown();
  updatePortfolioDashboard();
  showNotification(`Created portfolio "${cleanName}" successfully!`, 'success');
}

// Delete the currently active portfolio
export function deleteCurrentPortfolio() {
  if (portfoliosList.length <= 1) {
    showNotification("You must keep at least one portfolio!", "error");
    return;
  }

  const active = portfoliosList.find(p => p.id === activePortfolioId);
  const activeName = active ? active.name : "this portfolio";

  const confirmDelete = confirm(`Are you sure you want to permanently delete the portfolio "${activeName}"?\nThis will erase all its holdings and transaction logs.`);
  if (!confirmDelete) return;

  // Filter out the active portfolio
  const updatedList = portfoliosList.filter(p => p.id !== activePortfolioId);
  setPortfoliosList(updatedList);

  // Set the new active portfolio to the first remaining one
  setActivePortfolioId(portfoliosList[0].id);
  const newActive = portfoliosList[0];

  // Sync to active state
  portfolioState.holdings = newActive.holdings || {};
  portfolioState.transactions = newActive.transactions || [];
  portfolioState.realizedPL = newActive.realizedPL || 0;
  portfolioState.selectedTicker = null;

  savePortfolioToStorage();

  // Re-render UI
  updatePortfolioSelectorDropdown();
  updatePortfolioDashboard();
  showNotification(`Deleted portfolio "${activeName}" successfully.`, "success");
}

// Rename the currently active portfolio
export function renameCurrentPortfolio(newName) {
  if (!newName || newName.trim() === '') return;
  const cleanName = newName.trim();

  // Find currently active portfolio
  const active = portfoliosList.find(p => p.id === activePortfolioId);
  if (!active) return;

  const oldName = active.name;

  if (oldName === cleanName) return; // Name is unchanged

  // Check if name already exists in another portfolio
  if (portfoliosList.some(p => p.id !== activePortfolioId && p.name.toLowerCase() === cleanName.toLowerCase())) {
    showNotification(`A portfolio named "${cleanName}" already exists!`, 'error');
    return;
  }

  active.name = cleanName;
  savePortfolioToStorage();

  // Re-render UI
  updatePortfolioSelectorDropdown();
  updatePortfolioDashboard();
  showNotification(`Renamed portfolio "${oldName}" to "${cleanName}" successfully!`, 'success');
}

// Execute transaction
export function executeTransaction(ticker, type, shares, price, dateStr = '', fees = 0, account = 'Default') {
  shares = parseFloat(String(shares).replace(/,/g, '').trim());
  price = parseFloat(String(price).replace(/,/g, '').trim());
  fees = parseFloat(String(fees).replace(/,/g, '').trim()) || 0;
  account = String(account).trim() || 'Default';

  if (!ticker) {
    alert("Please select a stock asset first.");
    return false;
  }
  if (isNaN(shares) || shares <= 0) {
    alert("Please enter a valid quantity of shares.");
    return false;
  }
  if (isNaN(price) || price <= 0) {
    alert("Please enter a valid price per share.");
    return false;
  }
  if (isNaN(fees) || fees < 0) {
    alert("Please enter a valid non-negative trading fee.");
    return false;
  }

  // Pre-validate for sell sufficiency if we're selling
  if (type === 'SELL') {
    const holding = portfolioState.holdings[ticker];
    if (!holding || holding.shares + 1e-9 < shares) {
      alert(`Insufficient shares. You are attempting to sell ${shares} shares of ${ticker}, but you only own ${holding ? holding.shares : 0} shares.`);
      return false;
    }
  }

  // Pre-validate transaction date (must not be in the future relative to today)
  if (dateStr) {
    const txDate = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (txDate > today) {
      alert(`Invalid Transaction Date: The selected date (${dateStr}) is in the future. Transactions cannot be recorded with a future date.`);
      return false;
    }
  }

  // Backdate support: if dateStr is provided, use T00:00:00 local-safe boundary, otherwise use Date.now()
  const timestamp = dateStr ? new Date(dateStr + 'T00:00:00').getTime() : Date.now();

  // Add Transaction entry
  portfolioState.transactions.push({
    timestamp: timestamp,
    ticker: ticker,
    type: type,
    shares: shares,
    price: price,
    fees: fees,
    account: account
  });

  // Re-build holdings & realized P&L chronologically
  rebuildPortfolioFromTransactions();

  // Proactively fetch background history if this is a newly traded stock in the portfolio
  loadPortfolioHistory();

  // Reset transaction form input values
  const txSharesEl = document.getElementById('txShares');
  if (txSharesEl) txSharesEl.value = 10;
  
  const txFeesInput = document.getElementById('txFees');
  if (txFeesInput) txFeesInput.value = '0.00';
  
  const txAccountInput = document.getElementById('txAccount');
  if (txAccountInput) {
    const active = portfoliosList.find(p => p.id === activePortfolioId);
    txAccountInput.value = active ? active.name : 'Default';
  }

  // Reset date picker to today
  const dateInput = document.getElementById('txDate');
  if (dateInput) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    dateInput.value = `${yyyy}-${mm}-${dd}`;
  }

  alert(`Successfully recorded transaction: ${type} ${shares} ${ticker} @ ${formatCurrency(price)}!`);
  
  // Refresh sidebar stock list as prices/holdings changed
  const searchInput = document.getElementById('stockSearch');
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  renderStockList(query);
  
  return true;
}
