function parseCSV(text) {
  const lines = [];
  let row = [""];
  let insideQuote = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuote && nextChar === '"') {
        row[row.length - 1] += '"';
        i++;
      } else {
        insideQuote = !insideQuote;
      }
    } else if (char === ',' && !insideQuote) {
      row.push("");
    } else if ((char === '\r' || char === '\n') && !insideQuote) {
      if (char === '\r' && nextChar === '\n') {
        i++;
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

export function importTransactionsFromCSV(csvText) {
  const rows = parseCSV(csvText);
  if (rows.length < 2) {
    throw new Error("CSV file is empty or missing data rows.");
  }

  const headers = rows[0].map(h => h.toLowerCase().trim());
  const dateIdx = headers.findIndex(h => h.includes("date"));
  const typeIdx = headers.findIndex(h => h.includes("type") || h.includes("transaction") || h.includes("action") || h.includes("side") || h.includes("dividend") || h.includes("income"));
  const symbolIdx = headers.findIndex(h => h.includes("symbol") || h.includes("ticker") || h.includes("stock") || h.includes("etf") || h.includes("asset"));
  const qtyIdx = headers.findIndex(h => h.includes("qty") || h.includes("quantity") || h.includes("unit") || h.includes("shares"));
  const priceIdx = headers.findIndex(h => 
    h.includes("price") || 
    h.includes("amount per") || 
    h.includes("per unit") || 
    h.includes("per share") ||
    (h.includes("amount") && !h.includes("total") && !h.includes("before"))
  );
  const feesIdx = headers.findIndex(h => 
    (h.includes("fee") || h.includes("fees") || h.includes("commission") || h.includes("brokerage") || h.includes("tax") || h.includes("charge")) && 
    !h.includes("before")
  );
  const accountIdx = headers.findIndex(h => h.includes("account") || h.includes("portfolio"));

  if (dateIdx === -1 || typeIdx === -1 || symbolIdx === -1 || qtyIdx === -1 || priceIdx === -1) {
    throw new Error("CSV Import Failed: Missing required columns.\n\nRequired:\n- Date\n- Type (BUY/SELL/DIVIDEND)\n- Symbol\n- Quantity\n- Price / Amount per unit");
  }

  const parseNumber = (val) => {
    if (val === undefined || val === null) return 0;
    const cleaned = String(val).replace(/[^0-9.-]/g, '').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  };

  const importedTxs = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length === 0 || (row.length === 1 && row[0] === "")) continue;

    const rowNum = i + 1;
    const dateVal = row[dateIdx];
    const typeVal = row[typeIdx];
    const symbolVal = row[symbolIdx];
    const qtyVal = row[qtyIdx];
    const priceVal = row[priceIdx];

    if (!dateVal || !typeVal || !symbolVal || !qtyVal || !priceVal) {
      throw new Error(`Row ${rowNum} contains empty cells.`);
    }

    const ticker = symbolVal.toUpperCase().trim();
    const rawType = typeVal.toUpperCase().trim();
    let type = '';
    if (rawType.includes('BUY') || rawType === 'B' || rawType.includes('PURCHASE') || rawType.includes('LONG')) {
      type = 'BUY';
    } else if (rawType.includes('SELL') || rawType === 'S' || rawType.includes('SALE') || rawType.includes('SHORT')) {
      type = 'SELL';
    } else if (rawType.includes('DIV') || rawType.includes('INCOME') || rawType.includes('PAYOUT') || rawType.includes('DISTRIBUTION')) {
      type = 'DIVIDEND';
    } else {
      throw new Error(`Row ${rowNum}: Type must be BUY, SELL, or DIVIDEND. Found: "${typeVal}"`);
    }

    const shares = parseNumber(qtyVal);
    if (shares <= 0) {
      throw new Error(`Row ${rowNum}: Quantity must be positive. Found: "${qtyVal}"`);
    }

    const price = parseNumber(priceVal);
    if (type !== 'DIVIDEND' && price <= 0) {
      throw new Error(`Row ${rowNum}: Price must be positive. Found: "${priceVal}"`);
    }
    if (type === 'DIVIDEND' && price < 0) {
      throw new Error(`Row ${rowNum}: Dividend payout must be non-negative. Found: "${priceVal}"`);
    }

    const dateParts = dateVal.split(/[-/.]/);
    if (dateParts.length !== 3) {
      throw new Error(`Row ${rowNum}: Date format must be DD-MM-YYYY. Found: "${dateVal}"`);
    }
    const txDate = new Date(`${dateParts[2]}-${dateParts[1].padStart(2, '0')}-${dateParts[0].padStart(2, '0')}T00:00:00`);
    if (isNaN(txDate.getTime())) {
      throw new Error(`Row ${rowNum}: Date "${dateVal}" is invalid.`);
    }
    if (txDate > today) {
      throw new Error(`Row ${rowNum}: Date is in the future.`);
    }

    const feesVal = feesIdx !== -1 ? row[feesIdx] : "0";
    const fees = parseNumber(feesVal);
    if (fees < 0) {
      throw new Error(`Row ${rowNum}: Fees must be non-negative.`);
    }

    const account = accountIdx !== -1 ? row[accountIdx].trim() : "Default";

    importedTxs.push({
      timestamp: txDate.getTime(),
      ticker,
      type,
      shares,
      price,
      fees,
      account
    });
  }

  return importedTxs;
}

export function exportTransactionsAsCSV(transactions, portfolioName) {
  let csvContent = "Date,Type,Symbol,Quantity,Price,Fee/Withholding Tax,Account\r\n";
  transactions.forEach(tx => {
    const d = new Date(tx.timestamp);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dateStr = `${dd}-${mm}-${d.getFullYear()}`;
    csvContent += `${dateStr},${tx.type},${tx.ticker},${tx.shares},${tx.price},${tx.fees || 0},"${tx.account || 'Default'}"\r\n`;
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `${portfolioName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_transactions_export.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function validateCSVImport(importedTxs, portfolios, activePortfolioId) {
  const active = portfolios.find(p => p.id === activePortfolioId) || portfolios[0];

  const txsByPortfolio = {};
  importedTxs.forEach(tx => {
    const account = tx.account || '';
    const match = portfolios.find(p => p.name.toLowerCase() === account.toLowerCase()) || active;
    const id = match.id;
    if (!txsByPortfolio[id]) txsByPortfolio[id] = [];
    txsByPortfolio[id].push(tx);
  });

  const affectedPortIds = Object.keys(txsByPortfolio);
  for (const id of affectedPortIds) {
    const port = portfolios.find(p => p.id === id);
    if (!port) continue;

    const imported = txsByPortfolio[id];
    const existing = port.transactions || [];
    const combined = [...existing, ...imported].sort((a, b) => a.timestamp - b.timestamp);

    const simHoldings = {};
    for (const tx of combined) {
      if (tx.type === 'BUY') {
        simHoldings[tx.ticker] = (simHoldings[tx.ticker] || 0) + tx.shares;
      } else if (tx.type === 'SELL') {
        const owned = simHoldings[tx.ticker] || 0;
        if (owned + 1e-9 < tx.shares) {
          const dateStr = new Date(tx.timestamp).toLocaleDateString();
          throw new Error(`Insufficiency in "${port.name}": On ${dateStr}, you sold ${tx.shares} ${tx.ticker} but only owned ${owned} shares.`);
        }
        simHoldings[tx.ticker] = owned - tx.shares;
        if (simHoldings[tx.ticker] < 1e-9) delete simHoldings[tx.ticker];
      } else if (tx.type === 'DIVIDEND') {
        // Dividend transactions do not reduce share balances
      }
    }
  }

  return txsByPortfolio;
}
