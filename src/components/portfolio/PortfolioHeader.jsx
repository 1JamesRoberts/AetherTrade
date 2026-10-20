import { SegmentedControl } from '../ui/Controls.jsx';

export default function PortfolioHeader({ portfolios, activePortfolio, activePortfolioId, baseCurrency,
  onUpdateBaseCurrency, onPortfolioSelect, onCreatePortfolio, onRenamePortfolio, onDeletePortfolio }) {
  return <header className="portfolio-account-header">
    <div className="portfolio-account-identity">
      <span className="portfolio-account-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="7" width="18" height="14" rx="3" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12a21 21 0 0 0 18 0M12 11v4" /></svg></span>
      <label><span>Portfolio account</span><select aria-label="Active portfolio" id="portfolioSelector" value={activePortfolioId} onChange={onPortfolioSelect} title="Select Active Portfolio">{portfolios.map(portfolio => <option key={portfolio.id} value={portfolio.id}>{portfolio.name}</option>)}</select></label>
    </div>
    <div className="portfolio-account-settings">
      <div className="portfolio-reporting-currency"><span>Reporting currency</span><SegmentedControl label="Portfolio base currency" value={baseCurrency === 'THB' ? 'THB' : 'USD'} onChange={currency => onUpdateBaseCurrency?.(activePortfolio.id, currency)} options={[{ value: 'USD', label: 'USD' }, { value: 'THB', label: 'THB' }]} /></div>
      <details className="account-actions" onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary').focus(); } }}><summary aria-label="Portfolio actions" title="Portfolio actions">•••</summary><div className="account-action-menu">
        <button type="button" onClick={onCreatePortfolio} id="btnCreatePortfolio" className="btn-portfolio-action" aria-label="Create new portfolio"><i className="fa-solid fa-plus" aria-hidden="true" /><span className="portfolio-action-label">New portfolio</span></button>
        <button type="button" onClick={onRenamePortfolio} id="btnRenamePortfolio" className="btn-portfolio-action" aria-label="Rename active portfolio"><i className="fa-solid fa-pen" aria-hidden="true" /><span className="portfolio-action-label">Rename</span></button>
        <button type="button" onClick={onDeletePortfolio} id="btnDeletePortfolio" className="btn-portfolio-action btn-delete-portfolio" aria-label="Delete active portfolio"><i className="fa-solid fa-trash-can" aria-hidden="true" /><span className="portfolio-action-label">Delete portfolio</span></button>
      </div></details>
    </div>
  </header>;
}
