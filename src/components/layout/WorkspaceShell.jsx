import { useAppearance } from '../../theme/appearanceContext.js';
import { isCloudEnabled } from '../../lib/supabase.js';

const destinations = [
  { id: 'portfolio', label: 'Portfolio', icon: 'fa-briefcase', shortcut: 'P' },
  { id: 'terminal', label: 'Research', icon: 'fa-chart-line', shortcut: 'T' },
  { id: 'activity', label: 'Activity', icon: 'fa-list-check', shortcut: 'A' },
];
export function AppearancePicker() {
  const { preference, setPreference } = useAppearance();
  return <label className="appearance-picker"><i className="fa-solid fa-circle-half-stroke" aria-hidden="true" /><span className="visually-hidden">Appearance</span><select value={preference} onChange={event => setPreference(event.target.value)}><option>System</option><option>Light</option><option>Dark</option></select></label>;
}
export default function WorkspaceShell({ view, onNavigate, onRecord, user, signOut, marketStatus, onLoadReviewData, children }) {
  const destination = destinations.find(item => item.id === view) || destinations[0];
  const review = import.meta.env.MODE === 'review';
  const storageLabel = review ? 'Local review · not synced' : isCloudEnabled ? 'Cloud workspace' : 'On this device';
  const navigation = destinations.map(item => <button key={item.id} type="button" onClick={() => onNavigate(item.id)} aria-current={view === item.id ? 'page' : undefined} className={`workspace-nav-item ${view === item.id ? 'selected' : ''}`} title={`${item.label} (${item.shortcut})`}><i className={`fa-solid ${item.icon}`} aria-hidden="true" /><span>{item.label}</span><kbd>{item.shortcut}</kbd></button>);
  return <div className={`workspace-shell ${view === 'terminal' ? 'workspace-research' : ''}`}>
    <a href="#main-workspace" className="skip-to-content">Skip to workspace</a>
    <aside className="workspace-sidebar">
      <button className="workspace-brand" onClick={() => onNavigate('portfolio')}><span className="workspace-brand-mark">a<span>↗</span></span>AetherTrade</button>
      <p className="workspace-caption">YOUR WORKSPACE</p>
      <nav aria-label="Main navigation">{navigation}</nav>
      <div className="workspace-sidebar-bottom"><div className="workspace-storage-note"><span className="connection-dot" /><strong>{storageLabel}</strong><p>{isCloudEnabled ? 'Your portfolios, connected.' : 'Your portfolios stay in this browser.'}</p></div><div className="workspace-profile"><span className="workspace-avatar">{(user.email || 'A')[0].toUpperCase()}</span><div><strong>{user.email}</strong><small>{review ? 'Disposable review workspace' : 'Personal workspace'}</small></div><button className="workspace-icon-button" onClick={signOut} title="Sign out" aria-label="Sign out"><i className="fa-solid fa-right-from-bracket" /></button></div></div>
    </aside>
    <div className="workspace-content"><header className="workspace-topbar"><div className="workspace-breadcrumb">Workspace <span>/</span> <strong>{destination.label}</strong></div><div className="workspace-topbar-actions"><span className="workspace-market-status"><span className={`connection-dot ${marketStatus.statusClass}`} />{marketStatus.label}<span className="workspace-market-clock"> · {marketStatus.timeStr}</span></span><AppearancePicker /><button className="workspace-icon-button mobile-signout" onClick={signOut} aria-label="Sign out"><i className="fa-solid fa-right-from-bracket" /></button></div></header>
      <main id="main-workspace" className="app-workspace"><div className="workspace-page-heading"><div><h1>{destination.label}</h1><p>{view === 'portfolio' ? 'Your investments at a glance' : view === 'terminal' ? 'Follow companies. Explore the details.' : 'Transactions and audit history'}</p></div><button className="workspace-primary" onClick={onRecord}><i className="fa-solid fa-plus" aria-hidden="true" /> Record transaction</button></div>
      {review && <div className="workspace-review-notice" role="note"><i className="fa-solid fa-shield-halved" aria-hidden="true" />Local review. Cloud is disabled; use disposable data here.<button type="button" onClick={onLoadReviewData}>Load fictional sample</button></div>}
      {children}
      <footer className="workspace-footer"><span><span className="connection-dot" />{storageLabel}</span><span>{isCloudEnabled ? 'Account synchronization enabled' : 'Export CSV backups to keep a copy of your records'}</span></footer></main>
    </div><nav className="workspace-bottom-nav" aria-label="Mobile navigation">{navigation}</nav>
  </div>;
}
