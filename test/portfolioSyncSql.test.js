import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const alice = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const bob = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const migration = await fs.readFile(new URL('../supabase/migrations/20261014_safe_portfolio_sync.sql', import.meta.url), 'utf8');
const schema = await fs.readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8');

async function setup() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key);
    insert into auth.users values ('${alice}'), ('${bob}');
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
    create publication supabase_realtime;
  `);
  // uuid-ossp is unused by the schema's text IDs and not bundled with this test runtime.
  await db.exec(schema.replace('create extension if not exists "uuid-ossp";', ''));
  // The deployment migration must also be safe to apply repeatedly to existing tables.
  await db.exec(migration);
  await db.exec('set role authenticated;');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [alice]);
  return db;
}
const row = (id, portfolioId = 'p', type = 'BUY', shares = 10) => ({ id, portfolio_id: portfolioId,
  ticker: 'AAPL', type, shares, price: 100, fees: 0, date: '2025-01-02T00:00:00Z' });
async function initialize(db, id = 'p', transactions = [row('original', id)]) {
  await db.query('select public.initialize_portfolios($1::jsonb, $2::jsonb)',
    [JSON.stringify([{ id, name: 'Primary', base_currency: 'USD', target_allocations: {} }]), JSON.stringify(transactions)]);
}
async function replace(db, ids, transactions) {
  await db.query('select public.replace_portfolio_transactions($1::text[], $2::jsonb)', [ids, JSON.stringify(transactions)]);
}

test('SQL replacement rolls back deletion and insertion when replacement validation fails', async () => {
  const db = await setup();
  try {
    await initialize(db);
    await assert.rejects(replace(db, ['p'], [row('invalid', 'p', 'SELL')]), /sale exceeds/);
    assert.deepEqual((await db.query('select id from public.transactions')).rows, [{ id: 'original' }]);
    await assert.rejects(replace(db, ['p'], [{ ...row('bad'), price: -1 }]), /check constraint/);
    assert.deepEqual((await db.query('select id from public.transactions')).rows, [{ id: 'original' }]);
    await replace(db, ['p'], [row('buy'), row('sell', 'p', 'SELL')]);
    assert.deepEqual((await db.query('select id from public.transactions order by ledger_order')).rows, [{ id: 'buy' }, { id: 'sell' }]);
  } finally { await db.close(); }
});

test('SQL functions enforce account ownership and prevent cross-account initialization copies', async () => {
  const db = await setup();
  try {
    await initialize(db);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [bob]);
    assert.equal((await db.query('select * from public.portfolios')).rows.length, 0);
    await assert.rejects(replace(db, ['p'], []), /not available/);
    await initialize(db, 'bob-p', []);
    assert.deepEqual((await db.query('select id from public.portfolios')).rows, [{ id: 'bob-p' }]);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [alice]);
    assert.deepEqual((await db.query('select id from public.transactions')).rows, [{ id: 'original' }]);
  } finally { await db.close(); }
});

test('first-login initialization is atomic, idempotent, and rejects foreign replacement rows', async () => {
  const db = await setup();
  try {
    await assert.rejects(initialize(db, 'p', [row('bad', 'p', 'SELL')]), /sale exceeds/);
    assert.equal((await db.query('select * from public.portfolios')).rows.length, 0);
    await initialize(db);
    await initialize(db, 'ignored', []);
    assert.deepEqual((await db.query('select id from public.portfolios')).rows, [{ id: 'p' }]);
    await assert.rejects(replace(db, ['p'], [row('foreign', 'unowned')]), /selected portfolio/);
    assert.deepEqual((await db.query('select id from public.transactions')).rows, [{ id: 'original' }]);
    await replace(db, ['p'], []);
    assert.equal((await db.query('select * from public.transactions')).rows.length, 0);
  } finally { await db.close(); }
});

test('database rejects invalid direct edits/deletions and repeated sales, but allows portfolio cascades', async () => {
  const db = await setup();
  try {
    await initialize(db);
    await db.query(`insert into public.transactions(id, portfolio_id, ticker, type, shares, price, fees, date)
      values ('sale', 'p', 'AAPL', 'SELL', 10, 120, 0, '2025-01-03')`);
    await assert.rejects(db.query("update public.transactions set shares = 1 where id = 'original'"), /sale exceeds/);
    await assert.rejects(db.query("delete from public.transactions where id = 'original'"), /sale exceeds/);
    await assert.rejects(db.query(`insert into public.transactions(id, portfolio_id, ticker, type, shares, price, fees, date)
      values ('second-sale', 'p', 'AAPL', 'SELL', 1, 120, 0, '2025-01-04')`), /sale exceeds/);
    assert.equal((await db.query('select count(*)::int as count from public.transactions')).rows[0].count, 2);
    await db.query("delete from public.portfolios where id = 'p'");
    assert.equal((await db.query('select count(*)::int as count from public.transactions')).rows[0].count, 0);
  } finally { await db.close(); }
});
