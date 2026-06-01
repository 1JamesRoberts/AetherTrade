// ==========================================================================
// CSV PARSING AND IMPORT MODULE (csv.js)
// Handles CSV validation, parsing, and multi-portfolio account-matching routing
// ==========================================================================

import {
  portfolioState,
  portfoliosList,
  activePortfolioId,
  savePortfolioToStorage,
  showNotification
} from './state.js';

import {
  rebuildSpecificPortfolio,
  updatePortfolioDashboard
} from './portfolio.js';

import {
  loadPortfolioHistory
} from './api.js';

// Parse CSV text with support for double-quoted fields
export function parseCSV(text) {
  const lines = [];
  let row = [""];
  let insideQuote = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuote && nextChar === '"') {
        row[row.length - 1] += '"';
        i++; // skip next quote
      } else {
        insideQuote = !insideQuote;
      }
    } else if (char === ',' && !insideQuote) {
      row.push("");
    } else if ((char === '\r' || char === '\n') && !insideQuote) {
      if (char === '\r' && nextChar === '\n') {
        i++; // skip \n
      }
      lines.push(row.map(cell => cell.trim()));
      row = [""];
    } else {
      row[row.length - 1] += char;
    }
  }
  
  if (row.length > 1 || row[0] !== "") {
    lines.push(row.map(cell => cell.trim()));
  }
  return lines;
}

// Import transactions from CSV format
export function importTransactionsFromCSV(csvText) {
  try {
    const rows = parseCSV(csvText);
    if (rows.length < 2) {
      showNotification("CSV file is empty or missing data rows.", "error");
      return;
    }

    const headers = rows[0].map(h => h.toLowerCase());
    
    // Dynamically locate header indices to support any column order
    const dateIdx = headers.findIndex(h => h.includes("date"));
    const typeIdx = headers.findIndex(h => h.includes("type") || h.includes("transaction type"));
    const symbolIdx = headers.findIndex(h => h.includes("symbol") || h.includes("ticker") || h.includes("stock") || h.includes("etf"));
    const qtyIdx = headers.findIndex(h => h.includes("qty") || h.includes("quantity") || h.includes("units"));
    const priceIdx = headers.findIndex(h => h.includes("price") || h.includes("amount per unit") || h.includes("unit price"));
    const feesIdx = headers.findIndex(h => h.includes("fee") || h.includes("commission") || h.includes("transaction fee") || h.includes("trading fee"));
    const accountIdx = headers.findIndex(h => h.includes("account") || h.includes("investment account") || h.includes("portfolio account"));

    if (dateIdx === -1 || typeIdx === -1 || symbolIdx === -1 || qtyIdx === -1 || priceIdx === -1) {
      alert("CSV Import Failed: Missing required columns.\n\nYour CSV must contain these columns:\n- Date (DD-MM-YYYY)\n- Transaction Type (BUY/SELL)\n- Stock / ETF Symbol\n- Quantity of Units\n- Amount per unit");
      return;
    }

    const importedTxs = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length === 0 || (row.length === 1 && row[0] === "")) continue; // skip blank rows

      const rowNum = i + 1;

      // Extract values
      const dateVal = row[dateIdx];
      const typeVal = row[typeIdx];
      const symbolVal = row[symbolIdx];
      const qtyVal = row[qtyIdx];
      const priceVal = row[priceIdx];

      if (!dateVal || !typeVal || !symbolVal || !qtyVal || !priceVal) {
        throw new Error(`Row ${rowNum} contains empty cells.`);
      }

      // 1. Parse Ticker Symbol
      const ticker = symbolVal.toUpperCase().trim();
      if (!ticker) throw new Error(`Row ${rowNum}: Symbol cannot be empty.`);

      // 2. Parse Type
      const type = typeVal.toUpperCase().trim();
      if (type !== 'BUY' && type !== 'SELL') {
        throw new Error(`Row ${rowNum}: Transaction type must be BUY or SELL. Found: "${typeVal}"`);
      }

      // 3. Parse Quantity
      const shares = parseFloat(String(qtyVal).replace(/,/g, '').trim());
      if (isNaN(shares) || shares <= 0) {
        throw new Error(`Row ${rowNum}: Quantity of Units must be a positive number. Found: "${qtyVal}"`);
      }

      // 4. Parse Price
      const price = parseFloat(String(priceVal).replace(/,/g, '').trim());
      if (isNaN(price) || price <= 0) {
        throw new Error(`Row ${rowNum}: Amount per unit must be a positive number. Found: "${priceVal}"`);
      }

      // 5. Parse Date (DD-MM-YYYY)
      const dateParts = dateVal.split(/[-/]/);
      if (dateParts.length !== 3) {
        throw new Error(`Row ${rowNum}: Date format must be DD-MM-YYYY. Found: "${dateVal}"`);
      }
      const dd = dateParts[0].padStart(2, '0');
      const mm = dateParts[1].padStart(2, '0');
      const yyyy = dateParts[2];
      const dateStr = `${yyyy}-${mm}-${dd}`;
      const txDate = new Date(dateStr + 'T00:00:00');

      if (isNaN(txDate.getTime())) {
        throw new Error(`Row ${rowNum}: Date "${dateVal}" is invalid.`);
      }

      // 6. Parse Fees
      const feesVal = feesIdx !== -1 ? row[feesIdx] : "0";
      const fees = parseFloat(String(feesVal).replace(/,/g, '').trim()) || 0;
      if (isNaN(fees) || fees < 0) {
        throw new Error(`Row ${rowNum}: Trading Fees must be a non-negative number. Found: "${feesVal}"`);
      }

      // 7. Parse Account
      const accountVal = accountIdx !== -1 ? row[accountIdx] : "Default";
      const account = String(accountVal).trim() || "Default";
      if (txDate > today) {
        throw new Error(`Row ${rowNum}: Transaction date "${dateVal}" is in the future.`);
      }

      importedTxs.push({
        timestamp: txDate.getTime(),
        ticker: ticker,
        type: type,
        shares: shares,
        price: price,
        fees: fees,
        account: account
      });
    }

    if (importedTxs.length === 0) {
      showNotification("No transactions found in CSV file.", "error");
      return;
    }

    // Ask the user to Append or Replace
    const active = portfoliosList.find(p => p.id === activePortfolioId);
    const activeName = active ? active.name : "Primary Portfolio";
    
    const choice = confirm(
      `Found ${importedTxs.length} valid transactions in CSV.\n\n` +
      `Click OK to APPEND the transactions to their matched portfolios (or "${activeName}" if unmatched).\n` +
      `Click CANCEL to REPLACE all existing transactions in the matched portfolios (or "${activeName}" if unmatched) with the new ones.`
    );
    
    // Group imported transactions by target portfolio ID based on Investment Account name
    const txsByPortfolio = {};
    importedTxs.forEach(tx => {
      const account = tx.account || '';
      const matchingPort = portfoliosList.find(p => p.name.toLowerCase() === account.toLowerCase());
      const targetPort = matchingPort || active;
      const portId = targetPort.id;
      
      if (!txsByPortfolio[portId]) {
        txsByPortfolio[portId] = [];
      }
      txsByPortfolio[portId].push(tx);
    });

    // Validate chronological holdings simulation for each affected portfolio
    const affectedPortIds = Object.keys(txsByPortfolio);
    for (let pIdx = 0; pIdx < affectedPortIds.length; pIdx++) {
      const portId = affectedPortIds[pIdx];
      const port = portfoliosList.find(p => p.id === portId);
      if (!port) continue;

      const importedTxsForThisPortfolio = txsByPortfolio[portId];
      const existingTxs = (portId === activePortfolioId) ? portfolioState.transactions : (port.transactions || []);
      const combinedTxs = choice ? [...existingTxs, ...importedTxsForThisPortfolio] : [...importedTxsForThisPortfolio];
      combinedTxs.sort((a, b) => a.timestamp - b.timestamp);

      // Validate simulation
      const simulatedHoldings = {};
      for (let i = 0; i < combinedTxs.length; i++) {
        const tx = combinedTxs[i];
        const ticker = tx.ticker;
        if (tx.type === 'BUY') {
          simulatedHoldings[ticker] = (simulatedHoldings[ticker] || 0) + tx.shares;
        } else {
          // SELL
          const currentShares = simulatedHoldings[ticker] || 0;
          if (currentShares + 1e-9 < tx.shares) {
            const dateStr = new Date(tx.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            alert(
              `CSV Import Aborted (Insufficiency Error in portfolio "${port.name}"):\n\n` +
              `On ${dateStr}, you have a transaction selling ${tx.shares} shares of ${tx.ticker}, ` +
              `but you only own ${currentShares} shares at that point in time.\n\n` +
              `Please ensure your buy dates precede your sell dates in the CSV.`
            );
            return;
          }
          const newShares = currentShares - tx.shares;
          if (newShares < 1e-9) {
            delete simulatedHoldings[ticker];
          } else {
            simulatedHoldings[ticker] = newShares;
          }
        }
      }
    }

    // All validations succeeded! Update each affected portfolio's transactions list and rebuild
    affectedPortIds.forEach(portId => {
      const port = portfoliosList.find(p => p.id === portId);
      if (!port) return;

      const importedTxsForThisPortfolio = txsByPortfolio[portId];
      const existingTxs = (portId === activePortfolioId) ? portfolioState.transactions : (port.transactions || []);
      let combinedTxs = choice ? [...existingTxs, ...importedTxsForThisPortfolio] : [...importedTxsForThisPortfolio];
      combinedTxs.sort((a, b) => a.timestamp - b.timestamp);

      port.transactions = combinedTxs;
      rebuildSpecificPortfolio(port);

      // If it is the active portfolio, sync the in-memory global state!
      if (portId === activePortfolioId) {
        portfolioState.transactions = combinedTxs;
        portfolioState.holdings = port.holdings;
        portfolioState.realizedPL = port.realizedPL;
      }
    });

    // Persist all changes to storage and update dashboard rendering
    savePortfolioToStorage();

    // Trigger price histories loads for any new tickers
    loadPortfolioHistory();

    // Reset input fields
    const fileInput = document.getElementById('csvFileInput');
    if (fileInput) fileInput.value = '';

    // Refresh UI
    updatePortfolioDashboard();
    showNotification(`Successfully imported ${importedTxs.length} transactions!`, 'success');

  } catch (err) {
    alert(`CSV Import Failed:\n\n${err.message}`);
  }
}

// Export transactions as CSV format
export function exportTransactionsAsCSV() {
  const txs = portfolioState.transactions;
  if (!txs || txs.length === 0) {
    showNotification("No transactions recorded in the current portfolio to export.", "warning");
    return;
  }

  // Header row
  let csvContent = "Date,Type,Symbol,Quantity,Price,Fee,Account\r\n";

  // Data rows
  txs.forEach(tx => {
    const txDate = new Date(tx.timestamp);
    const dd = String(txDate.getDate()).padStart(2, '0');
    const mm = String(txDate.getMonth() + 1).padStart(2, '0');
    const yyyy = txDate.getFullYear();
    const dateStr = `${dd}-${mm}-${yyyy}`;

    const type = tx.type;
    const ticker = tx.ticker;
    const shares = tx.shares;
    const price = tx.price;
    const fees = tx.fees || 0;
    const account = tx.account || "Default";

    // Escape any quotes in account name if present
    const escapedAccount = account.replace(/"/g, '""');

    csvContent += `${dateStr},${type},${ticker},${shares},${price},${fees},"${escapedAccount}"\r\n`;
  });

  // Create a blob and trigger browser download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  
  // Find current active portfolio name for filename
  const active = portfoliosList.find(p => p.id === activePortfolioId);
  const activeName = active ? active.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() : "portfolio";
  
  link.setAttribute("href", url);
  link.setAttribute("download", `${activeName}_transactions_export.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  showNotification("Transactions successfully exported as CSV!", "success");
}

