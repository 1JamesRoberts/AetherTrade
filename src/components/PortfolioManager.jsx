import { useState } from 'react';
import PortfolioHeader from './portfolio/PortfolioHeader';
import AllocationDonut from './portfolio/AllocationDonut';
import TradeOrderForm from './portfolio/TradeOrderForm';
import TransactionLedger from './portfolio/TransactionLedger';

export default function PortfolioManager({
  initialTab = 'trade',
  showAllocation = true,
  overview = null,
  portfolios,
  activePortfolioId,
  setActivePortfolioId,
  stocks,
  onAddTransaction,
  onEditTransaction,
  onDeleteTransaction,
  onCreatePortfolio,
  onRenamePortfolio,
  onDeletePortfolio,
  onUpdateBaseCurrency,
  prefilledTrade,
  onClearPrefilledTrade,
  showNotification,
  onFetchPrice
}) {
  // Sub-tab selection ('trade' | 'history')
  const [activeSubTab, setActiveSubTab] = useState(initialTab);

  // Editing state for existing transaction
  const [editingSelection, setEditingSelection] = useState(null);

  const activePortfolio = portfolios.find(p => p.id === activePortfolioId) || {
    id: 'default',
    name: 'Primary Portfolio',
    holdings: {},
    transactions: [],
    realizedPL: 0
  };

  const baseCurrency = activePortfolio.baseCurrency || 'USD';

  // Handle Portfolio Switch
  const handlePortfolioSelect = (e) => {
    const nextId = e.target.value;
    onClearPrefilledTrade?.();
    setActivePortfolioId(nextId);
    setEditingSelection(null);
  };

  // Create Portfolio
  const handleCreatePortfolio = () => {
    const name = prompt('Enter a name for the new portfolio account:', 'Secondary Portfolio');
    if (name && name.trim()) {
      if (onCreatePortfolio) {
        onCreatePortfolio(name.trim());
      }
    }
  };

  // Rename Portfolio
  const handleRenamePortfolio = () => {
    const newName = prompt(`Enter new name for portfolio "${activePortfolio.name}":`, activePortfolio.name);
    if (newName && newName.trim() && newName.trim() !== activePortfolio.name) {
      if (onRenamePortfolio) {
        onRenamePortfolio(activePortfolio.id, newName.trim());
      }
    }
  };

  // Delete Portfolio
  const handleDeletePortfolio = () => {
    if (portfolios.length <= 1) {
      showNotification?.('Cannot delete the only remaining portfolio account.', 'warning');
      return;
    }
    const confirmDelete = confirm(`Are you sure you want to delete portfolio "${activePortfolio.name}"?\nAll associated holdings and audit logs will be permanently deleted.`);
    if (!confirmDelete) return;

    if (onDeletePortfolio) {
      onDeletePortfolio(activePortfolio.id);
    }
  };

  // Start editing existing transaction
  const handleStartEdit = (index, tx) => {
    onClearPrefilledTrade?.();
    setEditingSelection({ id: tx.id, tx, index });
    setActiveSubTab('trade');
  };

  // Cancel editing existing transaction
  const handleCancelEdit = () => {
    setEditingSelection(null);
  };

  const foundIndex = editingSelection ? activePortfolio.transactions.findIndex(tx =>
    editingSelection.id ? tx.id === editingSelection.id : tx === editingSelection.tx) : -1;
  const editingTxIndex = foundIndex >= 0 ? foundIndex : null;
  const editingTx = editingTxIndex !== null ? activePortfolio.transactions[editingTxIndex] : null;

  return (
    <section className="panel panel-portfolio-left" aria-label={overview ? "Portfolio overview" : "Portfolio transactions"}>
      <PortfolioHeader
        portfolios={portfolios}
        activePortfolio={activePortfolio}
        activePortfolioId={activePortfolioId}
        baseCurrency={baseCurrency}
        onUpdateBaseCurrency={onUpdateBaseCurrency}
        onPortfolioSelect={handlePortfolioSelect}
        onCreatePortfolio={handleCreatePortfolio}
        onRenamePortfolio={handleRenamePortfolio}
        onDeletePortfolio={handleDeletePortfolio}
      />

      {overview && activePortfolio.ledgerError && <p role="alert" className="auth-error">Ledger needs correction: {activePortfolio.ledgerError} Open Activity to correct the audit history.</p>}
      {overview}

      {!overview && <div className={`portfolio-management-grid ${showAllocation ? '' : 'editor-only'}`}>
        {showAllocation && <AllocationDonut
          activePortfolio={activePortfolio}
          stocks={stocks}
          baseCurrency={baseCurrency}
        />}
        <div className="portfolio-editor">

        {activePortfolio.ledgerError && <p role="alert" className="auth-error">
          Ledger needs correction: {activePortfolio.ledgerError} Edit Audit History or import a corrected CSV.
        </p>}

        {/* Sub-Tab Navigation Bar: Record Trade vs Transaction History */}
        <div className="portfolio-subtab-bar">
          <button
            type="button"
            onClick={() => setActiveSubTab('trade')}
            className={`portfolio-subtab-btn ${activeSubTab === 'trade' ? 'active' : ''}`}
          >
            <i className="fa-solid fa-pen-to-square"></i>
            <span>Record Trade</span>
          </button>
          <button
            type="button"
            onClick={() => { onClearPrefilledTrade?.(); setActiveSubTab('history'); }}
            className={`portfolio-subtab-btn ${activeSubTab === 'history' ? 'active' : ''}`}
          >
            <i className="fa-solid fa-list-check"></i>
            <span>Audit History</span>
            <span className="subtab-count-badge tabular-nums">{(activePortfolio?.transactions || []).length}</span>
          </button>
        </div>

        {activeSubTab === 'trade' ? (
          <TradeOrderForm
            key={`${activePortfolio.id}:${editingTx?.id || (editingTxIndex ?? 'new')}`}
            activePortfolio={activePortfolio}
            stocks={stocks}
            editingTxIndex={editingTxIndex}
            editingTx={editingTx}
            prefilledTrade={editingTxIndex === null && prefilledTrade?.portfolioId === activePortfolio.id ? prefilledTrade : null}
            onPrefillComplete={onClearPrefilledTrade}
            onAddTransaction={onAddTransaction}
            onEditTransaction={onEditTransaction}
            onCancelEdit={handleCancelEdit}
            showNotification={showNotification}
            onFetchPrice={onFetchPrice}
          />
        ) : (
          <TransactionLedger
            key={activePortfolio.id}
            activePortfolio={activePortfolio}
            onStartEdit={handleStartEdit}
            onDeleteTransaction={onDeleteTransaction}
          />
        )}
      </div>
      </div>}
    </section>
  );
}
