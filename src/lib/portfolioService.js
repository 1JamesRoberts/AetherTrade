import { restorePortfolio } from '../utils/portfolioLedger.js';

export function assertResult(result) {
  if (result.error) throw new Error(result.error.message || 'Cloud request failed.');
  return result.data;
}

export function transactionRow(tx, portfolioId) {
  return { id: tx.id, portfolio_id: portfolioId, ticker: tx.ticker, type: tx.type,
    shares: tx.shares, price: tx.price, fees: tx.fees || 0,
    date: new Date(tx.timestamp).toISOString() };
}

// PostgREST paginates results; a long personal trading history may exceed 1,000 rows.
async function readAll(query) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const page = assertResult(await query().range(offset, offset + 999));
    if (!Array.isArray(page)) throw new Error('Cloud returned an invalid response.');
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

export async function loadCloudPortfolios(client, userId) {
  const portfolios = await readAll(() => client.from('portfolios').select('*')
    .eq('user_id', userId).order('created_at').order('id'));
  if (!portfolios.length) return [];
  const transactions = await readAll(() => client.from('transactions').select('*')
    .in('portfolio_id', portfolios.map(p => p.id)).order('date').order('ledger_order'));
  return portfolios.map(p => restorePortfolio({ id: p.id, name: p.name,
    baseCurrency: p.base_currency, targetAllocations: p.target_allocations,
    transactions: transactions.filter(tx => tx.portfolio_id === p.id).map(tx => ({
      ...tx, account: p.name, timestamp: new Date(tx.date).getTime()
    })) }));
}

export async function replaceCloudTransactions(client, portfolioIds, rows) {
  // One SQL transaction: failure rolls back BOTH deletion and insertion.
  assertResult(await client.rpc('replace_portfolio_transactions', {
    p_portfolio_ids: portfolioIds, p_transactions: rows
  }));
}
