// ==========================================================================
// MAIN COORDINATOR MODULE (app.js)
// Orchestrates user interface, workspace views, event hooks, and DOM rendering
// ==========================================================================

import {
  state,
  portfolioState,
  portfoliosList,
  activePortfolioId,
  setActivePortfolioId,
  STOCKS_METADATA,
  loadWatchlist,
  saveWatchlist,
  seedMockDatabase,
  loadCachedStocks,
  saveCachedStocks,
  loadSupportResistanceLines,
  saveSupportResistanceLines,
  savePortfolioToStorage,
  loadPortfolioFromStorage,
  showNotification
} from './modules/state.js';

import {
  loadStockDataAndRender,
  fetchStockPriceInBackground,
  loadPortfolioHistory
} from './modules/api.js';

import {
  mainChart,
  renderStockChartDirect,
  renderAllocationChart,
  renderPerformanceChart
} from './modules/charts.js';

import {
  updatePortfolioSelectorDropdown,
  updatePortfolioDashboard,
  formatCurrency,
  createNewPortfolio,
  renameCurrentPortfolio,
  deleteCurrentPortfolio,
  executeTransaction
} from './modules/portfolio.js';

import {
  importTransactionsFromCSV
} from './modules/csv.js';

// --------------------------------------------------------------------------
// Authoritative DOM Rendering functions
// --------------------------------------------------------------------------

export function updateDashboard() {
  const activeStock = state.stocks[state.activeTicker];
  if (!activeStock) return;

  // Refresh the popular stock sidebar to display updated live prices (preserving search input)
  const searchInput = document.getElementById('stockSearch');
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  renderStockList(query);

  // Sync active portfolio statistics to show updated live prices immediately
  updatePortfolioDashboard();

  // Update header labels
  document.getElementById('activeTicker').innerText = activeStock.ticker;
  document.getElementById('activeName').innerText = activeStock.name;
  document.getElementById('activePrice').innerText = `$${activeStock.price.toFixed(2)}`;

  const trendEl = document.getElementById('activeChange');
  const displayChange = activeStock.timeframeChange !== undefined ? activeStock.timeframeChange : activeStock.change;
  trendEl.innerText = `${displayChange >= 0 ? '+' : ''}${displayChange.toFixed(2)}%`;
  trendEl.className = `stock-trend ${displayChange >= 0 ? 'positive' : 'negative'}`;

  // Segregate supports vs resistances (only factor them if S&R overlay is toggled on)
  const lines = state.showLevels ? (state.linesMap[state.activeTicker] || []) : [];
  const currentPrice = activeStock.price;

  const supports = [];
  const resistances = [];

  lines.forEach(price => {
    if (price < currentPrice) {
      supports.push(price);
    } else {
      resistances.push(price);
    }
  });

  supports.sort((a, b) => b - a);
  resistances.sort((a, b) => a - b);

  // Indicators
  document.getElementById('totalLevelsCount').innerText = lines.length;
  document.getElementById('supportLevelsCount').innerText = supports.length;
  document.getElementById('resistanceLevelsCount').innerText = resistances.length;

  // Pills lists
  renderPills(supports, 'sup', 'supportPills');
  renderPills(resistances, 'res', 'resistancePills');

  // Calculations matrix table
  renderCalculationsTable(supports, resistances);

  if (mainChart) {
    mainChart.draw();
  }
}

export function renderStockList(query = '') {
  const stockList = document.getElementById('stockList');
  if (!stockList) return;
  stockList.innerHTML = '';

  const filteredTickers = state.watchlist.filter(ticker => {
    const stock = state.stocks[ticker];
    if (!stock) return false;
    return ticker.toLowerCase().includes(query) ||
      (stock.name && stock.name.toLowerCase().includes(query));
  });

  filteredTickers.forEach(ticker => {
    const stock = state.stocks[ticker];
    if (!stock) return;

    const li = document.createElement('li');
    li.className = `stock-item ${ticker === state.activeTicker ? 'active' : ''}`;

    const isUp = stock.change >= 0;

    const priceText = stock.isLive ? `$${stock.price.toFixed(2)}` : '...';
    const changeHTML = stock.isLive
      ? `<span class="stock-item-change ${isUp ? 'up' : 'down'}">${isUp ? '+' : ''}${stock.change.toFixed(2)}%</span>`
      : `<span class="stock-item-change" style="opacity: 0.5; color: var(--text-muted); background: rgba(255, 255, 255, 0.03); padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600;">Loading...</span>`;

    li.innerHTML = `
      <div class="stock-item-info">
        <span class="stock-item-ticker">${stock.ticker}</span>
        <span class="stock-item-name">${stock.name}</span>
      </div>
      <div class="stock-item-right-wrapper">
        <div class="stock-item-stats">
          <span class="stock-item-price">${priceText}</span>
          ${changeHTML}
        </div>
        <button class="btn-watchlist-remove" title="Remove from watchlist" aria-label="Remove ${stock.ticker} from watchlist">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
    `;

    li.onclick = () => {
      state.activeTicker = stock.ticker;
      document.querySelectorAll('.stock-item').forEach(el => el.classList.remove('active'));
      li.classList.add('active');

      // Async trigger fetch and redraw
      loadStockDataAndRender(stock.ticker);
    };

    const removeBtn = li.querySelector('.btn-watchlist-remove');
    if (removeBtn) {
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        removeStockFromWatchlist(stock.ticker);
      };
    }

    stockList.appendChild(li);
  });

  const exactMatchInWatchlist = state.watchlist.some(ticker => ticker.toLowerCase() === query);
  if (query.length > 0 && !exactMatchInWatchlist) {
    const addLi = document.createElement('li');
    addLi.className = 'stock-item add-custom-item';
    addLi.innerHTML = `
      <div class="stock-item-info">
        <span class="stock-item-ticker" style="color: var(--cyan);"><i class="fa-solid fa-circle-plus"></i> Add '${query.toUpperCase()}'</span>
        <span class="stock-item-name">Add to your active watchlist</span>
      </div>
      <div class="stock-item-stats">
        <span class="stock-item-price" style="font-size: 11px; opacity: 0.6;">Fetch Live</span>
      </div>
    `;

    addLi.onclick = async () => {
      const ticker = query.toUpperCase();

      if (!state.watchlist.includes(ticker)) {
        state.watchlist.push(ticker);
        saveWatchlist();
      }

      if (!state.stocks[ticker]) {
        state.stocks[ticker] = {
          ticker: ticker,
          name: ticker + ' Stock',
          price: 0.0,
          change: 0.0,
          trend: 'up'
        };
      }

      state.activeTicker = ticker;

      const searchInput = document.getElementById('stockSearch');
      const clearSearchBtn = document.getElementById('clearSearch');
      if (searchInput) searchInput.value = '';
      if (clearSearchBtn) clearSearchBtn.style.display = 'none';

      await loadStockDataAndRender(ticker);
      renderStockList('');
    };

    stockList.appendChild(addLi);
  }
}

function renderPills(levels, type, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  if (levels.length === 0) {
    container.innerHTML = `<li class="empty-pill-msg">No ${type === 'sup' ? 'support' : 'resistance'} lines set. Click on chart.</li>`;
    return;
  }

  levels.forEach(price => {
    const pill = document.createElement('li');
    pill.className = `level-pill ${type}`;
    pill.innerHTML = `
      <span>$${price.toFixed(2)}</span>
      <button class="pill-delete-btn" data-price="${price}"><i class="fa-solid fa-trash"></i></button>
    `;

    pill.querySelector('.pill-delete-btn').onclick = (e) => {
      e.stopPropagation();
      const deletePrice = parseFloat(e.currentTarget.getAttribute('data-price'));
      const activeLines = state.linesMap[state.activeTicker] || [];
      state.linesMap[state.activeTicker] = activeLines.filter(p => p !== deletePrice);
      saveSupportResistanceLines();
      updateDashboard();
    };

    container.appendChild(pill);
  });
}

function renderCalculationsTable(supports, resistances) {
  const table = document.getElementById('projectionTable');
  const emptyState = document.getElementById('emptyMatrixState');
  if (!table || !emptyState) return;
  
  table.innerHTML = '';

  const capitalLabel = document.getElementById('matrixCapitalLabel');
  if (capitalLabel) {
    capitalLabel.innerText = `$${state.currentCapital.toLocaleString()}`;
  }
  const capitalInput = document.getElementById('globalCapital');
  if (capitalInput && document.activeElement !== capitalInput) {
    capitalInput.value = state.currentCapital;
  }

  // Check levels sizes
  if (supports.length === 0 || resistances.length === 0) {
    emptyState.style.display = 'flex';
    table.style.display = 'none';
    return;
  }

  emptyState.style.display = 'none';
  table.style.display = 'table';

  // Sort: Supports Descending, Resistances Ascending
  supports.sort((a, b) => b - a);
  resistances.sort((a, b) => a - b);

  // Generate dynamic table header (thead)
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  const cornerCell = document.createElement('th');
  cornerCell.innerHTML = 'SUP \\ RES';
  headerRow.appendChild(cornerCell);

  resistances.forEach(res => {
    const th = document.createElement('th');
    th.className = 'price-label-res';
    th.innerText = `$${res.toFixed(2)}`;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Generate dynamic table body (tbody)
  const tbody = document.createElement('tbody');

  supports.forEach(sup => {
    const tr = document.createElement('tr');

    // Row support header
    const rowHeader = document.createElement('td');
    rowHeader.className = 'price-label-sup';
    rowHeader.innerText = `$${sup.toFixed(2)}`;
    tr.appendChild(rowHeader);

    // Compute cell figures
    resistances.forEach(res => {
      const td = document.createElement('td');

      if (sup < res) {
        const roi = ((res - sup) / sup) * 100;
        const estProfit = (state.currentCapital / sup) * (res - sup);

        td.innerHTML = `
          <span class="matrix-cell-profit">+$${estProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          <span class="matrix-cell-roi">+${roi.toFixed(2)}%</span>
        `;
      } else {
        td.innerHTML = `<span class="matrix-cell-invalid">—</span>`;
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
}

function renderTickerTape() {
  const tape = document.getElementById('tickerTape');
  if (!tape) return;
  tape.innerHTML = '';

  const tapeData = [...STOCKS_METADATA, ...STOCKS_METADATA];

  tapeData.forEach(item => {
    const div = document.createElement('div');
    div.className = 'ticker-item';
    const isUp = item.change >= 0;

    div.innerHTML = `
      <span class="ticker-name">${item.ticker}</span>
      <span class="ticker-price">$${item.price.toFixed(2)}</span>
      <span class="ticker-change ${isUp ? 'up' : 'down'}">
        ${isUp ? '▲' : '▼'} ${Math.abs(item.change)}%
      </span>
    `;

    div.onclick = () => {
      state.activeTicker = item.ticker;
      renderStockList('');
      loadStockDataAndRender(item.ticker);
    };

    tape.appendChild(div);
  });
}

// --------------------------------------------------------------------------
// Workspace Interconnectivity Binders and Watchlist Removers
// --------------------------------------------------------------------------

async function removeStockFromWatchlist(ticker) {
  state.watchlist = state.watchlist.filter(t => t !== ticker);
  saveWatchlist();

  if (state.activeTicker === ticker) {
    if (state.watchlist.length > 0) {
      state.activeTicker = state.watchlist[0];
      await loadStockDataAndRender(state.activeTicker);
    } else {
      state.activeTicker = 'AAPL';
      await loadStockDataAndRender('AAPL');
    }
  }

  const searchInput = document.getElementById('stockSearch');
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  renderStockList(query);
}

function setupCoreEventListeners() {
  const tfButtons = document.querySelectorAll('.tf-btn');
  tfButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      tfButtons.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      state.selectedTimeframe = e.target.getAttribute('data-tf');

      // Load live data for the active ticker with the new timeframe
      loadStockDataAndRender(state.activeTicker);
    });
  });

  const styleButtons = document.querySelectorAll('.style-btn');
  styleButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      styleButtons.forEach(b => b.classList.remove('active'));
      const target = e.currentTarget;
      target.classList.add('active');
      state.chartType = target.getAttribute('data-style');

      // Fast refresh chart draw
      renderStockChartDirect();
    });
  });

  const searchInput = document.getElementById('stockSearch');
  const clearSearchBtn = document.getElementById('clearSearch');

  if (searchInput && clearSearchBtn) {
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      clearSearchBtn.style.display = query.length > 0 ? 'block' : 'none';
      renderStockList(query);
    });

    clearSearchBtn.addEventListener('click', () => {
      searchInput.value = '';
      clearSearchBtn.style.display = 'none';
      renderStockList('');
      searchInput.focus();
    });
  }

  const btnRefreshStock = document.getElementById('btnRefreshStock');
  if (btnRefreshStock) {
    btnRefreshStock.onclick = () => {
      loadStockDataAndRender(state.activeTicker);
    };
  }

  const clearAllLinesEl = document.getElementById('clearAllLines');
  if (clearAllLinesEl) {
    clearAllLinesEl.onclick = () => {
      state.linesMap[state.activeTicker] = [];
      saveSupportResistanceLines();
      updateDashboard();
    };
  }

  const capitalInput = document.getElementById('globalCapital');
  if (capitalInput) {
    capitalInput.addEventListener('input', (e) => {
      let val = parseFloat(e.target.value);
      if (isNaN(val) || val <= 0) val = 100;
      state.currentCapital = val;
      updateDashboard();
    });
  }

  // Toggle S&R Overlay Switch
  const toggleSR = document.getElementById('toggleSR');
  if (toggleSR) {
    toggleSR.addEventListener('change', (e) => {
      state.showLevels = e.target.checked;
      updateDashboard();
    });
  }

  // Zoom range slider
  const zoomSlider = document.getElementById('zoomSlider');
  const zoomLabel = document.getElementById('zoomLabel');
  if (zoomSlider && zoomLabel) {
    zoomSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      state.zoomLevel = val;
      zoomLabel.innerText = `${val}%`;
      renderStockChartDirect();
    });
  }
}

// Portfolio Search and Autocomplete Widget
function setupPortfolioSearch() {
  const searchInput = document.getElementById('portfolioStockSearch');
  const dropdown = document.getElementById('portfolioSearchDropdown');
  const clearBtn = document.getElementById('clearPortfolioSearch');

  if (!searchInput || !dropdown) return;

  // Select Stock helper
  function selectStockForTransaction(ticker) {
    const stock = state.stocks[ticker] || STOCKS_METADATA.find(s => s.ticker === ticker);
    if (!stock) return;

    portfolioState.selectedTicker = ticker;
    searchInput.value = ticker;
    if (clearBtn) clearBtn.style.display = 'block';
    dropdown.style.display = 'none';

    // Set default price
    const currentPrice = stock.price || 150.00;
    document.getElementById('txPrice').value = currentPrice.toFixed(2);

    // Calculate total est
    const qty = parseFloat(document.getElementById('txShares').value) || 10;
    document.getElementById('txTotalEst').innerText = formatCurrency(qty * currentPrice);

    // Show Stock Preview Info Card
    const preview = document.getElementById('portfolioStockPreview');
    const tickerEl = document.getElementById('previewTicker');
    const nameEl = document.getElementById('previewName');
    const priceEl = document.getElementById('previewPrice');
    const changeEl = document.getElementById('previewChange');

    if (tickerEl) tickerEl.innerText = stock.ticker;
    if (nameEl) nameEl.innerText = stock.name || (stock.ticker + ' Stock');
    if (priceEl) priceEl.innerText = formatCurrency(currentPrice);

    const changeVal = stock.change || 0;
    if (changeEl) {
      changeEl.innerText = `${changeVal >= 0 ? '+' : ''}${changeVal.toFixed(2)}%`;
      changeEl.className = changeVal >= 0 ? 'text-green' : 'text-red';
    }

    if (preview) preview.style.display = 'flex';
  }

  searchInput.addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase().trim();
    if (clearBtn) clearBtn.style.display = val.length > 0 ? 'block' : 'none';

    if (val.length === 0) {
      dropdown.style.display = 'none';
      return;
    }

    dropdown.innerHTML = '';

    // Filter STOCKS_METADATA & state.stocks safely preventing TypeError crashes when stock.name is undefined
    const matches = Object.values(state.stocks).filter(stock =>
      (stock.ticker && stock.ticker.toLowerCase().includes(val)) ||
      (stock.name && stock.name.toLowerCase().includes(val))
    );

    if (matches.length === 0) {
      // Add custom ticker option
      const div = document.createElement('div');
      div.className = 'portfolio-search-item';
      div.innerHTML = `
        <div>
          <span class="ticker"><i class="fa-solid fa-circle-plus"></i> ADD '${val.toUpperCase()}'</span>
          <span class="name">Add custom symbol</span>
        </div>
      `;
      div.onclick = async () => {
        const customTicker = val.toUpperCase();
        
        // Put in loading text
        searchInput.value = `Fetching ${customTicker}...`;
        searchInput.disabled = true;
        
        try {
          await fetchStockPriceInBackground(customTicker);
        } catch (e) {
          console.warn("Failed custom background price load", e);
        }
        
        // Fallback if price fetch failed or symbol is invalid
        if (!state.stocks[customTicker]) {
          state.stocks[customTicker] = {
            ticker: customTicker,
            name: customTicker + ' Stock',
            price: 150.00,
            change: 0.0,
            trend: 'up'
          };
        }
        
        searchInput.disabled = false;
        selectStockForTransaction(customTicker);
      };
      dropdown.appendChild(div);
      dropdown.style.display = 'block';
      return;
    }

    matches.slice(0, 5).forEach(stock => {
      const div = document.createElement('div');
      div.className = 'portfolio-search-item';
      div.innerHTML = `
        <div>
          <span class="ticker">${stock.ticker}</span>
          <span class="name">${stock.name || (stock.ticker + ' Stock')}</span>
        </div>
        <span class="price">${formatCurrency(stock.price)}</span>
      `;
      div.onclick = async () => {
        const ticker = stock.ticker;
        // Select it immediately with current cached price
        selectStockForTransaction(ticker);
        
        // Fetch latest price dynamically in the background
        try {
          await fetchStockPriceInBackground(ticker);
          // If the user hasn't switched away, update the price input and previews!
          if (portfolioState.selectedTicker === ticker) {
            const updatedStock = state.stocks[ticker];
            if (updatedStock && updatedStock.price) {
              const txPriceInput = document.getElementById('txPrice');
              if (txPriceInput) txPriceInput.value = updatedStock.price.toFixed(2);
              
              const qty = parseFloat(document.getElementById('txShares').value) || 10;
              const txTotalEst = document.getElementById('txTotalEst');
              if (txTotalEst) txTotalEst.innerText = formatCurrency(qty * updatedStock.price);
              
              const priceEl = document.getElementById('previewPrice');
              if (priceEl) priceEl.innerText = formatCurrency(updatedStock.price);
              
              const changeEl = document.getElementById('previewChange');
              if (changeEl) {
                const changeVal = updatedStock.change || 0;
                changeEl.innerText = `${changeVal >= 0 ? '+' : ''}${changeVal.toFixed(2)}%`;
                changeEl.className = changeVal >= 0 ? 'text-green' : 'text-red';
              }
            }
          }
        } catch (e) {
          console.warn("Failed dynamically updating selected ticker price", e);
        }
      };
      dropdown.appendChild(div);
    });

    dropdown.style.display = 'block';
  });

  if (clearBtn) {
    clearBtn.onclick = () => {
      searchInput.value = '';
      portfolioState.selectedTicker = null;
      clearBtn.style.display = 'none';
      dropdown.style.display = 'none';
      const preview = document.getElementById('portfolioStockPreview');
      if (preview) preview.style.display = 'none';
    };
  }

  // Document click closes dropdown
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-box')) {
      dropdown.style.display = 'none';
    }
  });
}

function setupPortfolioEventListeners() {
  // Navigation Tabs Toggling
  const navBtns = document.querySelectorAll('.nav-btn');
  const views = document.querySelectorAll('.workspace-view');

  navBtns.forEach(btn => {
    btn.onclick = (e) => {
      navBtns.forEach(b => b.classList.remove('active'));
      const targetBtn = e.currentTarget;
      targetBtn.classList.add('active');

      const targetView = targetBtn.getAttribute('data-view');
      views.forEach(v => {
        if (v.id === `view${targetView.charAt(0).toUpperCase() + targetView.slice(1)}`) {
          v.classList.add('active');
        } else {
          v.classList.remove('active');
        }
      });

      // Update data if switching to portfolio
      if (targetView === 'portfolio') {
        updatePortfolioDashboard();
      }
    };
  });

  // Transaction Form BUY / SELL Segmented buttons
  const txToggleBtns = document.querySelectorAll('.tx-toggle-btn');
  txToggleBtns.forEach(btn => {
    btn.onclick = (e) => {
      txToggleBtns.forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');

      const txType = e.currentTarget.getAttribute('data-tx');
      const submitBtn = document.getElementById('btnAddTransaction');

      if (txType === 'BUY') {
        submitBtn.style.background = 'linear-gradient(135deg, var(--cyan), var(--cyan-glow))';
        submitBtn.style.boxShadow = '0 4px 15px rgba(0, 240, 255, 0.2)';
        submitBtn.innerHTML = `<i class="fa-solid fa-circle-plus"></i> Record BUY Transaction`;
      } else {
        submitBtn.style.background = 'linear-gradient(135deg, var(--bearish), var(--bearish-glow))';
        submitBtn.style.boxShadow = '0 4px 15px var(--bearish-glow)';
        submitBtn.innerHTML = `<i class="fa-solid fa-circle-minus"></i> Record SELL Transaction`;
      }
    };
  });

  // Quantity & Price Input Change Listener for Estimated Cost Preview
  const txSharesInput = document.getElementById('txShares');
  const txPriceInput = document.getElementById('txPrice');

  if (txSharesInput && txPriceInput) {
    function recalculateEstimatedTxTotal() {
      const qty = parseFloat(txSharesInput.value) || 0;
      const price = parseFloat(txPriceInput.value) || 0;
      const txFeesInput = document.getElementById('txFees');
      const fees = txFeesInput ? (parseFloat(txFeesInput.value) || 0) : 0;

      const activeToggle = document.querySelector('.tx-toggle-btn.active');
      const type = activeToggle ? activeToggle.getAttribute('data-tx') : 'BUY';

      const gross = qty * price;
      const net = type === 'BUY' ? (gross + fees) : Math.max(0, gross - fees);
      document.getElementById('txTotalEst').innerText = `${formatCurrency(net)} (${type === 'BUY' ? 'Total Cost' : 'Net Proceeds'}, gross: ${formatCurrency(gross)})`;
    }

    txSharesInput.addEventListener('input', recalculateEstimatedTxTotal);
    txPriceInput.addEventListener('input', recalculateEstimatedTxTotal);
    
    const txFeesInput = document.getElementById('txFees');
    if (txFeesInput) {
      txFeesInput.addEventListener('input', recalculateEstimatedTxTotal);
    }
    
    const txTypeToggleBtns = document.querySelectorAll('.tx-toggle-btn');
    txTypeToggleBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        setTimeout(recalculateEstimatedTxTotal, 10);
      });
    });
  }

  // Record Transaction Action Trigger
  const recordTxBtn = document.getElementById('btnAddTransaction');
  if (recordTxBtn) {
    recordTxBtn.onclick = () => {
      const activeToggle = document.querySelector('.tx-toggle-btn.active');
      const type = activeToggle ? activeToggle.getAttribute('data-tx') : 'BUY';
      const ticker = portfolioState.selectedTicker;
      const shares = parseFloat(txSharesInput.value);
      const price = parseFloat(txPriceInput.value);
      const dateInput = document.getElementById('txDate');
      const dateStr = dateInput ? dateInput.value : '';
      const txFeesInput = document.getElementById('txFees');
      const fees = txFeesInput ? (parseFloat(txFeesInput.value) || 0) : 0;
      const txAccountInput = document.getElementById('txAccount');
      const account = txAccountInput ? (txAccountInput.value.trim() || 'Default') : 'Default';

      executeTransaction(ticker, type, shares, price, dateStr, fees, account);
    };
  }

  // Reset Portfolio Button Action (resets active portfolio)
  const resetPortBtn = document.getElementById('btnResetPortfolio');
  if (resetPortBtn) {
    resetPortBtn.onclick = () => {
      const active = portfoliosList.find(p => p.id === activePortfolioId);
      const activeName = active ? active.name : "this portfolio";
      
      const confirmReset = confirm(`Are you absolutely sure you want to reset "${activeName}"?\nThis will liquidate all holdings and delete all transaction audit history for this portfolio.`);
      if (!confirmReset) return;

      portfolioState.holdings = {};
      portfolioState.transactions = [];
      portfolioState.selectedTicker = null;
      portfolioState.realizedPL = 0;

      // Reset search inputs
      const searchInput = document.getElementById('portfolioStockSearch');
      if (searchInput) searchInput.value = '';
      const preview = document.getElementById('portfolioStockPreview');
      if (preview) preview.style.display = 'none';

      savePortfolioToStorage();
      updatePortfolioDashboard();
    };
  }

  // Multi-Portfolio Selector change handler
  const portfolioSelector = document.getElementById('portfolioSelector');
  if (portfolioSelector) {
    portfolioSelector.onchange = (e) => {
      setActivePortfolioId(e.target.value);
      const active = portfoliosList.find(p => p.id === activePortfolioId);
      if (active) {
        portfolioState.holdings = active.holdings || {};
        portfolioState.transactions = active.transactions || [];
        portfolioState.realizedPL = active.realizedPL || 0;
        portfolioState.selectedTicker = null;
      }
      savePortfolioToStorage();
      
      // Load price histories for the newly active portfolio tickers
      loadPortfolioHistory();
      updatePortfolioDashboard();
    };
  }

  // Create Portfolio Button Click Handler
  const btnCreatePortfolio = document.getElementById('btnCreatePortfolio');
  if (btnCreatePortfolio) {
    btnCreatePortfolio.onclick = () => {
      const name = prompt("Enter a unique name for the new portfolio:");
      if (name !== null) {
        createNewPortfolio(name);
      }
    };
  }

  // Rename Portfolio Button Click Handler
  const btnRenamePortfolio = document.getElementById('btnRenamePortfolio');
  if (btnRenamePortfolio) {
    btnRenamePortfolio.onclick = () => {
      const active = portfoliosList.find(p => p.id === activePortfolioId);
      const activeName = active ? active.name : '';
      const name = prompt("Enter a new name for the portfolio:", activeName);
      if (name !== null) {
        renameCurrentPortfolio(name);
      }
    };
  }

  // Delete Portfolio Button Click Handler
  const btnDeletePortfolio = document.getElementById('btnDeletePortfolio');
  if (btnDeletePortfolio) {
    btnDeletePortfolio.onclick = () => {
      deleteCurrentPortfolio();
    };
  }

  // CSV Import Button Click Trigger
  const btnImportTransactions = document.getElementById('btnImportTransactions');
  const csvFileInput = document.getElementById('csvFileInput');
  
  if (btnImportTransactions && csvFileInput) {
    btnImportTransactions.onclick = () => {
      csvFileInput.click();
    };

    csvFileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target.result;
        importTransactionsFromCSV(text);
      };
      reader.readAsText(file);
    };
  }

  // Portfolio Price Refresh Trigger
  const btnRefreshPortfolioStock = document.getElementById('btnRefreshPortfolioStock');
  if (btnRefreshPortfolioStock) {
    btnRefreshPortfolioStock.onclick = async () => {
      const activeTickers = Object.keys(portfolioState.holdings).filter(t => portfolioState.holdings[t].shares > 0);
      if (activeTickers.length === 0) {
        showNotification("No active holdings to refresh.", "info");
        return;
      }

      const refreshIcon = document.querySelector('#btnRefreshPortfolioStock i');
      if (refreshIcon) refreshIcon.classList.add('fa-spin');

      try {
        const promises = activeTickers.map(ticker => {
          if (ticker === state.activeTicker) {
            return loadStockDataAndRender(ticker);
          } else {
            return fetchStockPriceInBackground(ticker);
          }
        });
        await Promise.all(promises);
        showNotification(`Successfully refreshed ${activeTickers.length} stock prices!`, 'success');
      } catch (err) {
        console.error("Failed to refresh portfolio stock prices:", err);
      } finally {
        if (refreshIcon) refreshIcon.classList.remove('fa-spin');
      }
    };
  }
}

// --------------------------------------------------------------------------
// Orchestration Lifecycle Bootstrapper
// --------------------------------------------------------------------------

function initPortfolio() {
  loadPortfolioFromStorage();
  updatePortfolioSelectorDropdown(); // Populate dropdown selector!
  setupPortfolioSearch();
  setupPortfolioEventListeners();

  // Default date input to local today's date YYYY-MM-DD
  const dateInput = document.getElementById('txDate');
  if (dateInput) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    dateInput.value = `${yyyy}-${mm}-${dd}`;
  }

  // Load price histories for all stocks present in the portfolio
  loadPortfolioHistory();

  updatePortfolioDashboard();
}

window.addEventListener('DOMContentLoaded', () => {
  loadWatchlist();
  seedMockDatabase();
  loadCachedStocks(); // Overwrite mock seeds with cached live records!
  loadSupportResistanceLines(); // Restore all cached Support & Resistance lines!
  renderTickerTape();
  renderStockList();
  setupCoreEventListeners();

  // Setup mouse leave canvas safety state reset
  const canvasElement = document.getElementById('mainChart');
  if (canvasElement) {
    canvasElement.addEventListener('mouseleave', () => {
      state.hoverPrice = null;
      if (mainChart) {
        mainChart.draw();
      }
    });
  }

  // Load first active stock live from Twelve Data
  loadStockDataAndRender(state.activeTicker);

  // Stagger background loads for all other watchlist assets to keep their prices fully up to date
  const otherTickers = state.watchlist.filter(t => t !== state.activeTicker);
  otherTickers.forEach((ticker, index) => {
    setTimeout(() => {
      // Check that it's still not the active ticker and is still in watchlist before loading
      if (ticker !== state.activeTicker && state.watchlist.includes(ticker)) {
        fetchStockPriceInBackground(ticker);
      }
    }, (index + 1) * 2000); // 2 second delay between queries to perfectly stagger within Twelve Data limits
  });

  // Initialize Portfolio Manager Engine
  initPortfolio();
});
