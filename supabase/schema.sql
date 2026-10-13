-- ==============================================================================
-- AETHERTRADE SUPABASE DATABASE SCHEMA (Tier 1 Sync)
-- ==============================================================================
-- Run this in your Supabase project's SQL Editor (https://supabase.com/dashboard/project/_/sql)

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. PORTFOLIOS TABLE
create table if not exists public.portfolios (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  base_currency text not null default 'USD',
  target_allocations jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Ensure new columns exist if portfolios table already exists
alter table public.portfolios add column if not exists base_currency text not null default 'USD';
alter table public.portfolios add column if not exists target_allocations jsonb not null default '{}'::jsonb;

-- 2. TRANSACTIONS TABLE
create table if not exists public.transactions (
  id text primary key,
  portfolio_id text references public.portfolios(id) on delete cascade not null,
  ticker text not null,
  type text not null check (type in ('BUY', 'SELL', 'DIVIDEND')),
  shares numeric not null check (shares > 0),
  price numeric not null check (price >= 0),
  fees numeric default 0,
  date timestamp with time zone not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Ensure type check constraint allows DIVIDEND on existing installations
do $$
begin
  alter table public.transactions drop constraint if exists transactions_type_check;
  alter table public.transactions add constraint transactions_type_check check (type in ('BUY', 'SELL', 'DIVIDEND'));
exception
  when others then null;
end $$;

-- 3. WATCHLISTS TABLE
create table if not exists public.watchlists (
  user_id uuid references auth.users(id) on delete cascade primary key,
  tickers jsonb not null default '["AAPL", "MSFT", "NVDA", "TSLA", "GOOG", "AMZN"]'::jsonb,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. CHART ANNOTATIONS TABLE (Support & Resistance Levels)
create table if not exists public.chart_annotations (
  user_id uuid references auth.users(id) on delete cascade primary key,
  lines_map jsonb not null default '{}'::jsonb,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES (Idempotent)
-- ==============================================================================

alter table public.portfolios enable row level security;
alter table public.transactions enable row level security;
alter table public.watchlists enable row level security;
alter table public.chart_annotations enable row level security;

-- Portfolios RLS
drop policy if exists "Users can manage their own portfolios" on public.portfolios;
create policy "Users can manage their own portfolios"
  on public.portfolios for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Transactions RLS (via portfolio ownership)
drop policy if exists "Users can manage transactions in their portfolios" on public.transactions;
create policy "Users can manage transactions in their portfolios"
  on public.transactions for all
  using (
    exists (
      select 1 from public.portfolios
      where portfolios.id = transactions.portfolio_id
      and portfolios.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.portfolios
      where portfolios.id = transactions.portfolio_id
      and portfolios.user_id = auth.uid()
    )
  );

-- Watchlists RLS
drop policy if exists "Users can manage their own watchlists" on public.watchlists;
create policy "Users can manage their own watchlists"
  on public.watchlists for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Chart Annotations RLS
drop policy if exists "Users can manage their own chart annotations" on public.chart_annotations;
create policy "Users can manage their own chart annotations"
  on public.chart_annotations for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ==============================================================================
-- API ACCESS GRANTS (Required for PostgREST / Supabase REST API)
-- ==============================================================================
-- Tables created via the Supabase dashboard get these automatically,
-- but tables created via raw SQL need explicit grants.

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on public.portfolios to anon, authenticated;
grant select, insert, update, delete on public.transactions to anon, authenticated;
grant select, insert, update, delete on public.watchlists to anon, authenticated;
grant select, insert, update, delete on public.chart_annotations to anon, authenticated;

-- ==============================================================================
-- REALTIME REPLICATION (Safe idempotent publication setup)
-- ==============================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'portfolios'
  ) then
    alter publication supabase_realtime add table public.portfolios;
  end if;

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'transactions'
  ) then
    alter publication supabase_realtime add table public.transactions;
  end if;

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'watchlists'
  ) then
    alter publication supabase_realtime add table public.watchlists;
  end if;

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chart_annotations'
  ) then
    alter publication supabase_realtime add table public.chart_annotations;
  end if;
end $$;

-- Safe portfolio synchronization (2026-10-14)
-- Run once in the Supabase SQL Editor before deploying the matching frontend.
-- The same definitions are included in schema.sql for fresh installations.

-- Stable entry order for multiple transactions with the same execution timestamp.
alter table public.transactions
  add column if not exists ledger_order bigint generated always as identity;
grant usage, select on sequence public.transactions_ledger_order_seq to authenticated;

create or replace function public.replace_portfolio_transactions(
  p_portfolio_ids text[], p_transactions jsonb
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  port_id text;
  locked_id text;
begin
  if auth.uid() is null then raise exception 'Sign in before changing transactions.'; end if;
  if p_portfolio_ids is null or cardinality(p_portfolio_ids) = 0 then
    raise exception 'Select at least one portfolio.';
  end if;
  if p_transactions is null or jsonb_typeof(p_transactions) <> 'array' then
    raise exception 'Transactions must be an array.';
  end if;

  -- Sorted locks prevent two replacements from interleaving, even across tabs.
  for port_id in select distinct unnest(p_portfolio_ids) order by 1 loop
    locked_id := null;
    select id into locked_id from public.portfolios
      where id = port_id and user_id = auth.uid() for update;
    if locked_id is null then raise exception 'Portfolio is not available to this account.'; end if;
  end loop;
  if exists (
    select 1 from jsonb_array_elements(p_transactions) item
    where (item->>'portfolio_id') is null
       or not ((item->>'portfolio_id') = any(p_portfolio_ids))
  ) then raise exception 'Every transaction must belong to a selected portfolio.'; end if;

  delete from public.transactions where portfolio_id = any(p_portfolio_ids);
  insert into public.transactions(id, portfolio_id, ticker, type, shares, price, fees, date)
  select t.id, t.portfolio_id, t.ticker, t.type, t.shares, t.price, coalesce(t.fees, 0), t.date
  from jsonb_array_elements(p_transactions) with ordinality as entry(item, entry_order)
  cross join lateral jsonb_to_record(entry.item) as t(
    id text, portfolio_id text, ticker text, type text, shares numeric,
    price numeric, fees numeric, date timestamptz
  ) order by entry.entry_order;

  if exists (select 1 from public.transactions where portfolio_id = any(p_portfolio_ids)
    and (length(trim(ticker)) = 0 or fees < 0 or (type <> 'DIVIDEND' and price <= 0))) then
    raise exception 'Invalid transaction quantity, price, fee, or symbol.';
  end if;
  if exists (
    select 1 from (
      select sum(case type when 'BUY' then shares when 'SELL' then -shares else 0 end)
        over (partition by portfolio_id, ticker order by date, ledger_order
          rows between unbounded preceding and current row) as balance
      from public.transactions where portfolio_id = any(p_portfolio_ids)
    ) ledger where balance < -0.000000001
  ) then raise exception 'A sale exceeds shares held on its execution date.'; end if;
  -- Any exception rolls back the deletion and every inserted row.
end;
$$;
revoke all on function public.replace_portfolio_transactions(text[], jsonb) from public, anon;
grant execute on function public.replace_portfolio_transactions(text[], jsonb) to authenticated;

create or replace function public.initialize_portfolios(
  p_portfolios jsonb, p_transactions jsonb
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  ids text[];
begin
  if auth.uid() is null then raise exception 'Sign in before creating portfolios.'; end if;
  -- Serialize first-login initialization, including React StrictMode and other tabs.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  if exists (select 1 from public.portfolios where user_id = auth.uid()) then return; end if;
  if p_portfolios is null or jsonb_typeof(p_portfolios) <> 'array' or jsonb_array_length(p_portfolios) = 0 then
    raise exception 'At least one portfolio is required.';
  end if;
  insert into public.portfolios(id, user_id, name, base_currency, target_allocations)
  select p.id, auth.uid(), p.name, coalesce(p.base_currency, 'USD'), coalesce(p.target_allocations, '{}'::jsonb)
  from jsonb_to_recordset(p_portfolios) as p(id text, name text, base_currency text, target_allocations jsonb);
  select array_agg(id) into ids from public.portfolios where user_id = auth.uid();
  perform public.replace_portfolio_transactions(ids, p_transactions);
end;
$$;
revoke all on function public.initialize_portfolios(jsonb, jsonb) from public, anon;
grant execute on function public.initialize_portfolios(jsonb, jsonb) to authenticated;

-- Validate all mutation paths (including simultaneous tabs), not just CSV imports.
-- Statement triggers see the complete batch, so same-day buys and sells validate together.
create or replace function public.validate_portfolio_transaction_statement()
returns trigger language plpgsql security invoker set search_path = public
as $$
declare
  affected_ids text[];
  port_id text;
begin
  if tg_op = 'INSERT' then
    select array_agg(distinct portfolio_id) into affected_ids from new_rows;
  elsif tg_op = 'DELETE' then
    select array_agg(distinct portfolio_id) into affected_ids from old_rows;
  else
    select array_agg(distinct portfolio_id) into affected_ids from (
      select portfolio_id from new_rows union select portfolio_id from old_rows
    ) affected;
  end if;
  for port_id in select unnest(affected_ids) order by 1 loop
    perform 1 from public.portfolios where id = port_id for update;
    if not found then continue; end if; -- Portfolio deletion cascades are valid.
    if exists (select 1 from public.transactions where portfolio_id = port_id
      and (length(trim(ticker)) = 0 or coalesce(fees, 0) < 0
        or (type <> 'DIVIDEND' and price <= 0)
        or shares::text in ('NaN', 'Infinity', '-Infinity')
        or price::text in ('NaN', 'Infinity', '-Infinity')
        or fees::text in ('NaN', 'Infinity', '-Infinity'))) then
      raise exception 'Invalid transaction quantity, price, fee, or symbol.';
    end if;
    if exists (select 1 from (
      select sum(case type when 'BUY' then shares when 'SELL' then -shares else 0 end)
        over (partition by ticker order by date, ledger_order
          rows between unbounded preceding and current row) as balance
      from public.transactions where portfolio_id = port_id
    ) ledger where balance < -0.000000001) then
      raise exception 'A sale exceeds shares held on its execution date.';
    end if;
  end loop;
  return null;
end;
$$;
revoke all on function public.validate_portfolio_transaction_statement() from public, anon;

-- Separate triggers are required for transition tables on each event.
drop trigger if exists validate_transactions_insert on public.transactions;
create trigger validate_transactions_insert after insert on public.transactions
  referencing new table as new_rows for each statement
  execute function public.validate_portfolio_transaction_statement();
drop trigger if exists validate_transactions_update on public.transactions;
create trigger validate_transactions_update after update on public.transactions
  referencing old table as old_rows new table as new_rows for each statement
  execute function public.validate_portfolio_transaction_statement();
drop trigger if exists validate_transactions_delete on public.transactions;
create trigger validate_transactions_delete after delete on public.transactions
  referencing old table as old_rows for each statement
  execute function public.validate_portfolio_transaction_statement();
