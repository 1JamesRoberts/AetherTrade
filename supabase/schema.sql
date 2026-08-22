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
  type text not null check (type in ('BUY', 'SELL')),
  shares numeric not null check (shares > 0),
  price numeric not null check (price >= 0),
  fees numeric default 0,
  date timestamp with time zone not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

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
