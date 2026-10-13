import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCloudPortfolios, replaceCloudTransactions } from '../src/lib/portfolioService.js';

function clientFor(portfolios, transactions, transactionError = null) {
  const ranges = [];
  return { ranges, from(table) {
    const query = { select() { return this; }, eq() { return this; }, in() { return this; }, order() { return this; },
      async range(start, end) {
        ranges.push({ table, start, end });
        const rows = table === 'portfolios' ? portfolios : transactions;
        return { data: rows.slice(start, end + 1), error: table === 'transactions' ? transactionError : null };
      } };
    return query;
  } };
}

test('failed transaction reads reject rather than masquerading as an empty ledger', async () => {
  const client = clientFor([{ id: 'p', name: 'P' }], [], { message: 'Network error' });
  await assert.rejects(loadCloudPortfolios(client, 'alice'), /Network error/);
});

test('cloud reads preserve portfolios with more than 1,000 transactions', async () => {
  const transactions = Array.from({ length: 1001 }, (_, i) => ({ id: `tx${i}`, portfolio_id: 'p',
    ticker: 'AAPL', type: 'BUY', shares: 1, price: 10, fees: 0, date: new Date(1000 + i).toISOString() }));
  const client = clientFor([{ id: 'p', name: 'P', base_currency: 'USD' }], transactions);
  const [port] = await loadCloudPortfolios(client, 'alice');
  assert.equal(port.transactions.length, 1001);
  assert.equal(port.holdings.AAPL.shares, 1001);
  assert.equal(client.ranges.filter(p => p.table === 'transactions').length, 2);
});

test('CSV replace uses one RPC and propagates failures without a separate delete', async () => {
  let calls = 0;
  const client = { from() { throw new Error('Must not delete separately'); }, async rpc(name, args) {
    ++calls;
    assert.equal(name, 'replace_portfolio_transactions');
    assert.deepEqual(args.p_portfolio_ids, ['p']);
    return { error: { message: 'Invalid replacement' } };
  } };
  await assert.rejects(replaceCloudTransactions(client, ['p'], []), /Invalid replacement/);
  assert.equal(calls, 1);
});
