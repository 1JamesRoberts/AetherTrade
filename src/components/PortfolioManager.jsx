import { useState } from 'react';
import PortfolioHeader from './portfolio/PortfolioHeader';
import AllocationDonut from './portfolio/AllocationDonut';
import TradeOrderForm from './portfolio/TradeOrderForm';
import TransactionLedger from './portfolio/TransactionLedger';

export default function PortfolioManager({
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
  showNotification,
  onFetchPrice
}) {
  // Sub-tab selection ('trade' | 'history')
  const [activeSubTab, setActiveSubTab] = useState('trade');

  // Editing state for existing transaction
  const [editingTxIndex, setEditingTxIndex] = useState(null);

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
    setActivePortfolioId(nextId);
    setEditingTxIndex(null);
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
  const handleStartEdit = (index, _tx) => {
    setEditingTxIndex(index);
    setActiveSubTab('trade');
  };

  // Cancel editing existing transaction
  const handleCancelEdit = () => {
    setEditingTxIndex(null);
  };

  const editingTx = editingTxIndex !== null ? activePortfolio.transactions?.[editingTxIndex] : null;

  return (
    <section className="panel panel-portfolio-left" aria-label="Portfolio Allocations">
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

      <AllocationDonut
        activePortfolio={activePortfolio}
        stocks={stocks}
        baseCurrency={baseCurrency}
      />

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
          onClick={() => setActiveSubTab('history')}
          className={`portfolio-subtab-btn ${activeSubTab === 'history' ? 'active' : ''}`}
        >
          <i className="fa-solid fa-list-check"></i>
          <span>Audit History</span>
          <span className="subtab-count-badge tabular-nums">{(activePortfolio?.transactions || []).length}</span>
        </button>
      </div>

      {activeSubTab === 'trade' ? (
        <TradeOrderForm
          activePortfolio={activePortfolio}
          stocks={stocks}
          editingTxIndex={editingTxIndex}
          editingTx={editingTx}
          prefilledTrade={prefilledTrade}
          onAddTransaction={onAddTransaction}
          onEditTransaction={onEditTransaction}
          onCancelEdit={handleCancelEdit}
          showNotification={showNotification}
          onFetchPrice={onFetchPrice}
        />
      ) : (
        <TransactionLedger
          activePortfolio={activePortfolio}
          onStartEdit={handleStartEdit}
          onDeleteTransaction={onDeleteTransaction}
        />
      )}
    </section>
  );
}
