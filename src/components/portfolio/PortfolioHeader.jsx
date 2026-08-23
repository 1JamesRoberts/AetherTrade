export default function PortfolioHeader({
  portfolios,
  activePortfolio,
  activePortfolioId,
  baseCurrency,
  onUpdateBaseCurrency,
  onPortfolioSelect,
  onCreatePortfolio,
  onRenamePortfolio,
  onDeletePortfolio
}) {
  return (
    <div className="panel-header portfolio-header-bar">
      <h2 className="panel-title">
        <i className="fa-solid fa-briefcase"></i> Portfolio Manager
      </h2>
      <div className="portfolio-actions-cluster">
        <div className="portfolio-currency-toggle" title="Portfolio Base Currency">
          <button
            type="button"
            onClick={() => onUpdateBaseCurrency && onUpdateBaseCurrency(activePortfolio.id, 'USD')}
            className={`currency-toggle-btn ${baseCurrency !== 'THB' ? 'active' : ''}`}
          >
            $ USD
          </button>
          <button
            type="button"
            onClick={() => onUpdateBaseCurrency && onUpdateBaseCurrency(activePortfolio.id, 'THB')}
            className={`currency-toggle-btn ${baseCurrency === 'THB' ? 'active' : ''}`}
          >
            ฿ THB
          </button>
        </div>
        <div className="portfolio-select-wrap">
          <select
            id="portfolioSelector"
            value={activePortfolioId}
            onChange={onPortfolioSelect}
            className="portfolio-account-select"
            title="Select Active Portfolio"
          >
            {portfolios.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <i className="fa-solid fa-chevron-down select-caret"></i>
        </div>
        <button
          type="button"
          onClick={onCreatePortfolio}
          id="btnCreatePortfolio"
          className="btn-portfolio-action btn-add-portfolio"
          title="Create new portfolio"
          aria-label="Create new portfolio"
        >
          <i className="fa-solid fa-plus"></i>
        </button>
        <button
          type="button"
          onClick={onRenamePortfolio}
          id="btnRenamePortfolio"
          className="btn-portfolio-action btn-edit-portfolio"
          title="Rename active portfolio"
          aria-label="Rename active portfolio"
        >
          <i className="fa-solid fa-pen"></i>
        </button>
        <button
          type="button"
          onClick={onDeletePortfolio}
          id="btnDeletePortfolio"
          className="btn-portfolio-action btn-delete-portfolio"
          title="Delete active portfolio"
          aria-label="Delete active portfolio"
        >
          <i className="fa-solid fa-trash-can"></i>
        </button>
      </div>
    </div>
  );
}
