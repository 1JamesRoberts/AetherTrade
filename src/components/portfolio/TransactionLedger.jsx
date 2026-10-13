import { useState, useMemo } from 'react';
import {
  detectTickerCurrency,
  formatMoney
} from '../../utils/currencyUtils';

export default function TransactionLedger({
  activePortfolio,
  onStartEdit,
  onDeleteTransaction
}) {
  // Transaction Ledger Filter States
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState('ALL'); // 'ALL' | 'BUY' | 'SELL' | 'DIVIDEND'
  const [ledgerSearchQuery, setLedgerSearchQuery] = useState('');

  // The parent keys this component by portfolio, resetting filters on switches.

  // Memoized filtered transactions retaining original 0-indexed positions
  const filteredTransactions = useMemo(() => {
    const allTxs = (activePortfolio?.transactions || []).map((tx, originalIndex) => ({ tx, originalIndex }));
    return allTxs.filter(({ tx }) => {
      if (ledgerTypeFilter !== 'ALL' && tx.type !== ledgerTypeFilter) {
        return false;
      }
      if (ledgerSearchQuery.trim()) {
        const q = ledgerSearchQuery.trim();
        const qUpper = q.toUpperCase();
        const qLower = q.toLowerCase();
        const ticker = (tx.ticker || '').toUpperCase();
        // Match ticker prefix (e.g. 'PL' matches 'PLTR', 'PLUG', but NOT 'AAPL')
        const tickerMatch = ticker.startsWith(qUpper);
        const accountMatch = (tx.account || '').toLowerCase().includes(qLower);
        if (!tickerMatch && !accountMatch) return false;
      }
      return true;
    });
  }, [activePortfolio?.transactions, ledgerTypeFilter, ledgerSearchQuery]);

  const allTransactions = activePortfolio?.transactions || [];

  return (
    <div className="analysis-section sidebar-ledger-section">
      <div className="section-subtitle">
        <span>Transaction Audit History</span>
        <span className="ledger-count-tag tabular-nums">
          {allTransactions.length === 0
            ? '0 Records'
            : filteredTransactions.length === allTransactions.length
            ? `${allTransactions.length} Records`
            : `Showing ${filteredTransactions.length} of ${allTransactions.length}`}
        </span>
      </div>

      {/* Filter Toolbar (Type Pills + Search Box) */}
      <div className="ledger-filter-toolbar">
        <div className="ledger-filter-pill-group">
          {['ALL', 'BUY', 'SELL', 'DIVIDEND'].map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setLedgerTypeFilter(type)}
              className={`ledger-filter-pill ${type.toLowerCase()} ${ledgerTypeFilter === type ? 'active' : ''}`}
            >
              {type}
            </button>
          ))}
        </div>

        <div className="ledger-search-box">
          <i className="fa-solid fa-magnifying-glass search-icon"></i>
          <input
            type="text"
            placeholder="Filter symbol/account..."
            value={ledgerSearchQuery}
            onChange={(e) => setLedgerSearchQuery(e.target.value)}
            className="ledger-search-input"
          />
          {ledgerSearchQuery && (
            <button
              type="button"
              onClick={() => setLedgerSearchQuery('')}
              className="ledger-search-clear-btn"
              title="Clear filter"
              aria-label="Clear filter"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          )}
        </div>
      </div>

      <div className="sidebar-ledger-viewport">
        <ul className="ledger-list" id="portfolioSidebarLogList">
          {allTransactions.length === 0 ? (
            <li className="empty-pill-msg" style={{ textAlign: 'center', paddingTop: '20px' }}>
              No transaction audit records found.
            </li>
          ) : filteredTransactions.length === 0 ? (
            <li className="empty-pill-msg filter-empty" style={{ textAlign: 'center', paddingTop: '20px' }}>
              <p>No transactions match your filter criteria.</p>
              <button
                type="button"
                onClick={() => {
                  setLedgerTypeFilter('ALL');
                  setLedgerSearchQuery('');
                }}
                className="btn-clear-filter"
              >
                <i className="fa-solid fa-rotate-left"></i> Reset Filters
              </button>
            </li>
          ) : (
            [...filteredTransactions].reverse().map(({ tx, originalIndex }) => {
              const txCurr = detectTickerCurrency(tx.ticker);
              const priceNum = parseFloat(tx.price) || 0;
              const sharesNum = parseFloat(tx.shares) || 0;
              // DIVIDEND rows are stored as shares=1, price=totalAmount (direct entry)
              const grossVal = sharesNum * priceNum;
              const txFees = parseFloat(tx.fees) || 0;
              const netVal = tx.type === 'BUY' ? (grossVal + txFees) : Math.max(0, grossVal - txFees);
              const accountStr = tx.account && tx.account !== 'Default' ? ` • ${tx.account}` : '';
              const rowKey = tx.id || `tx-side-log-${originalIndex}`;
              const txTime = typeof tx.timestamp === 'number' ? tx.timestamp : new Date(tx.date || tx.timestamp || 0).getTime();
              const txDateStr = !isNaN(txTime) ? new Date(txTime).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent';

              return (
                <li key={rowKey} className={`tx-ledger-item ${String(tx.type || 'BUY').toLowerCase()}`}>
                  <div className="ledger-left">
                    <div className="ledger-top-row">
                      <span className={`type-badge ${String(tx.type || 'BUY').toLowerCase()}`}>
                        {tx.type || 'BUY'}
                      </span>
                      <span className="ledger-shares-ticker tabular-nums">
                        {tx.type === 'DIVIDEND'
                          ? <strong>Dividend from {tx.ticker}</strong>
                          : <><strong>{parseFloat(sharesNum.toFixed(6))} {tx.ticker}</strong> @ {formatMoney(priceNum, txCurr)}</>
                        }
                      </span>
                    </div>
                    <div className="ledger-meta-row tabular-nums">
                      <span>Gross: {formatMoney(grossVal, txCurr)}</span>
                      <span>{tx.type === 'DIVIDEND' ? 'Tax/Fee' : 'Fee'}: {formatMoney(txFees, txCurr)}</span>
                      <span>Net: <strong className={tx.type === 'DIVIDEND' ? 'text-purple' : tx.type === 'BUY' ? 'text-green' : 'text-red'}>{tx.type === 'DIVIDEND' ? '+' : ''}{formatMoney(netVal, txCurr)}</strong></span>
                      {accountStr && <span className="account-tag">{accountStr}</span>}
                    </div>
                  </div>
                  <div className="ledger-right">
                    <span className="tx-time tabular-nums">{txDateStr}</span>
                    <div className="ledger-actions-group">
                      {onStartEdit && (
                        <button
                          type="button"
                          onClick={() => onStartEdit(originalIndex, tx)}
                          className="btn-tx-edit"
                          title="Edit transaction entry"
                          aria-label="Edit transaction entry"
                        >
                          <i className="fa-solid fa-pen-to-square"></i>
                        </button>
                      )}
                      {onDeleteTransaction && (
                        <button
                          type="button"
                          onClick={() => {
                            const confirmDelete = confirm("Do you want to delete this transaction entry? This will revert its effect on your holdings.");
                            if (confirmDelete) onDeleteTransaction(activePortfolio.id, originalIndex);
                          }}
                          className="btn-tx-delete"
                          title="Delete transaction entry"
                          aria-label="Delete transaction entry"
                        >
                          <i className="fa-solid fa-trash-can"></i>
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}
