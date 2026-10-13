/** Account-owned caches. Legacy data is claimed once, never shared on later logins. */
export function accountKey(key, userId) {
  return `${key}:${userId || 'anonymous'}`;
}

export function readStored(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch (error) {
    console.warn('Could not read saved data:', error);
    return fallback;
  }
}

export function writeStored(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn('Could not save data on this device:', error);
    return false;
  }
}

export function migrateLegacyStorage(userId) {
  if (!userId) return;
  const owner = readStored('aethertrade_legacy_owner', null);
  if (owner && owner !== userId) return;
  const portfolios = readStored('aethertrade_portfolios_list', []);
  if (!owner && Array.isArray(portfolios) && portfolios.some(p =>
    p.id?.startsWith('default_') && p.id !== `default_${userId}`)) return;
  if (!owner && !writeStored('aethertrade_legacy_owner', userId)) return;
  for (const key of ['aethertrade_portfolios_list', 'aethertrade_watchlist',
    'aethertrade_support_resistance', 'aethertrade_active_portfolio_id',
    'aethertrade_active_ticker']) {
    const scoped = accountKey(key, userId);
    try {
      if (localStorage.getItem(scoped) !== null) continue;
      const raw = localStorage.getItem(key);
      if (raw === null) continue;
      // Old active IDs/tickers were stored as plain strings.
      const value = key.includes('active_') ? raw : JSON.parse(raw);
      if (key === 'aethertrade_portfolios_list' && Array.isArray(value)) {
        const currencies = readStored('aethertrade_base_currencies', {});
        const targets = readStored('aethertrade_target_allocations', {});
        writeStored(scoped, value.map(p => ({ ...p,
          baseCurrency: p.baseCurrency || currencies[p.id] || 'USD',
          targetAllocations: p.targetAllocations || targets[p.id] || {}
        })));
      } else {
        writeStored(scoped, value);
      }
    } catch (error) { console.warn('Could not migrate saved data:', error); }
  }
}
