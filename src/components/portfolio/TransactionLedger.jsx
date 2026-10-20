import { SegmentedControl, ComponentHeading, AssetMark } from '../ui/Controls.jsx';
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
    <div className="analysis-section sidebar-ledger-section activity-ledger">
      <ComponentHeading title="Transaction Audit History" description="A complete record, with the details behind every entry."><span className="ui-count">{filteredTransactions.length} of {allTransactions.length} records</span></ComponentHeading>
      {/* Filter Toolbar (Type Pills + Search Box) */}
      <div className="ledger-filter-toolbar">
        <SegmentedControl label="Filter transactions" value={ledgerTypeFilter} onChange={setLedgerTypeFilter} options={['ALL', 'BUY', 'SELL', 'DIVIDEND'].map(value => ({ value, label: value === 'ALL' ? 'All' : value[0] + value.slice(1).toLowerCase() }))} />
        <div className="ledger-search-box">
          <i className="fa-solid fa-magnifying-glass search-icon"></i>
          <input
            type="text"
            aria-label="Filter transactions by symbol or account"
            placeholder="Find symbol or account"
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
                  <details className="audit-record">
                    <summary><AssetMark ticker={tx.ticker || '?'} /><span className={`audit-type-indicator ${String(tx.type || 'BUY').toLowerCase()}`}><span className="audit-type-dot" aria-hidden="true" />{tx.type || 'BUY'}</span><span className="audit-identity"><strong>{tx.ticker}</strong><span>{tx.type === 'DIVIDEND' ? 'Dividend' : tx.type === 'SELL' ? 'Sale' : 'Purchase'} · {txDateStr}</span></span><span className="audit-amount tabular-nums"><strong>{tx.type === 'DIVIDEND' ? '+' : ''}{formatMoney(netVal, txCurr)}</strong><small>{txCurr} · Net</small></span><span className="audit-chevron" aria-hidden="true">⌄</span></summary>
                    <div className="audit-detail"><dl><div><dt>Type</dt><dd>{tx.type || 'BUY'}</dd></div><div><dt>Quantity</dt><dd className="tabular-nums">{parseFloat(sharesNum.toFixed(6))}</dd></div><div><dt>Price</dt><dd className="tabular-nums">{formatMoney(priceNum, txCurr)}</dd></div><div><dt>Gross value</dt><dd className="tabular-nums">{formatMoney(grossVal, txCurr)}</dd></div><div><dt>{tx.type === 'DIVIDEND' ? 'Tax / fee' : 'Fee'}</dt><dd className="tabular-nums">{formatMoney(txFees, txCurr)}</dd></div><div><dt>Account</dt><dd>{accountStr ? tx.account : 'Default'}</dd></div></dl></div>
                  </details>
                  <div className="ledger-right">
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
