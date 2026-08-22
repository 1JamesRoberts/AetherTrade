import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const isConfigured = 
  supabaseUrl && 
  supabaseAnonKey && 
  !supabaseUrl.includes('your_supabase') && 
  !supabaseAnonKey.includes('your_supabase') &&
  supabaseUrl.startsWith('http');

class MockQueryBuilder {
  constructor(table) {
    this.table = table;
    this.dataToReturn = [];
  }

  select(_columns) {
    void _columns;
    if (this.table === 'portfolios') {
      const local = localStorage.getItem('aethertrade_portfolios_list');
      this.dataToReturn = local ? JSON.parse(local) : [];
    } else if (this.table === 'transactions') {
      const localPortfolios = localStorage.getItem('aethertrade_portfolios_list');
      const portfolios = localPortfolios ? JSON.parse(localPortfolios) : [];
      const txs = [];
      portfolios.forEach(p => {
        if (p.transactions) {
          p.transactions.forEach(tx => {
            txs.push({
              id: tx.id,
              portfolio_id: p.id,
              ticker: tx.ticker,
              type: tx.type,
              shares: tx.shares,
              price: tx.price,
              fees: tx.fees || 0,
              date: new Date(tx.timestamp).toISOString()
            });
          });
        }
      });
      this.dataToReturn = txs;
    } else if (this.table === 'watchlists') {
      const local = localStorage.getItem('aethertrade_watchlist');
      const tickers = local ? JSON.parse(local) : ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'GOOG', 'AMZN'];
      this.dataToReturn = [{ user_id: 'mock-user-id', tickers }];
    } else if (this.table === 'chart_annotations') {
      const local = localStorage.getItem('aethertrade_support_resistance');
      const lines_map = local ? JSON.parse(local) : {};
      this.dataToReturn = [{ user_id: 'mock-user-id', lines_map }];
    }
    return this;
  }

  order(_column, _options = {}) {
    void _column;
    void _options;
    return this;
  }

  insert(data) {
    this.dataToReturn = data;
    return this;
  }

  upsert(data) {
    this.dataToReturn = data;
    if (this.table === 'watchlists' && data?.tickers) {
      try { localStorage.setItem('aethertrade_watchlist', JSON.stringify(data.tickers)); } catch (e) { console.error(e); }
    } else if (this.table === 'chart_annotations' && data?.lines_map) {
      try { localStorage.setItem('aethertrade_support_resistance', JSON.stringify(data.lines_map)); } catch (e) { console.error(e); }
    }
    return this;
  }

  update(data) {
    this.dataToReturn = data;
    return this;
  }

  delete() {
    return this;
  }

  eq(_column, _value) {
    void _column;
    void _value;
    return this;
  }

  in(_column, _values) {
    void _column;
    void _values;
    return this;
  }

  single() {
    if (Array.isArray(this.dataToReturn)) {
      this.dataToReturn = this.dataToReturn[0] || null;
    }
    return this;
  }

  maybeSingle() {
    if (Array.isArray(this.dataToReturn)) {
      this.dataToReturn = this.dataToReturn[0] || null;
    }
    return this;
  }

  then(onfulfilled) {
    return Promise.resolve({ data: this.dataToReturn, error: null }).then(onfulfilled);
  }
}

class MockAuth {
  constructor() {
    this.listeners = new Set();
    const savedSession = localStorage.getItem('aethertrade_mock_session');
    this.session = savedSession ? JSON.parse(savedSession) : null;
  }

  async getSession() {
    return { data: { session: this.session }, error: null };
  }

  onAuthStateChange(callback) {
    this.listeners.add(callback);
    // Trigger callback with initial session
    setTimeout(() => {
      callback('SIGNED_IN', this.session);
    }, 0);
    return {
      data: {
        subscription: {
          unsubscribe: () => {
            this.listeners.delete(callback);
          }
        }
      }
    };
  }

  _notify() {
    for (const listener of this.listeners) {
      listener(this.session ? 'SIGNED_IN' : 'SIGNED_OUT', this.session);
    }
  }

  async signUp({ email }) {
    const user = { id: 'mock-user-id', email };
    this.session = { user };
    localStorage.setItem('aethertrade_mock_session', JSON.stringify(this.session));
    this._notify();
    return { data: { user }, error: null };
  }

  async signInWithPassword({ email }) {
    const user = { id: 'mock-user-id', email };
    this.session = { user };
    localStorage.setItem('aethertrade_mock_session', JSON.stringify(this.session));
    this._notify();
    return { data: { session: this.session }, error: null };
  }

  async signInWithOAuth({ provider }) {
    const user = { id: `mock-${provider}-user`, email: `guest-${provider}@aethertrade.local` };
    this.session = { user };
    localStorage.setItem('aethertrade_mock_session', JSON.stringify(this.session));
    this._notify();
    return { error: null };
  }

  async signOut() {
    this.session = null;
    localStorage.removeItem('aethertrade_mock_session');
    this._notify();
    return { error: null };
  }
}

class MockSupabaseClient {
  constructor() {
    this.auth = new MockAuth();
  }

  from(table) {
    return new MockQueryBuilder(table);
  }
}

if (isConfigured) {
  console.log('%cAetherTrade: Connected to Supabase backend.', 'color: #10b981; font-weight: bold;');
} else {
  console.warn(
    '%cAetherTrade: Supabase environment variables not found or unconfigured. Running in Mock Database / local-only mode.',
    'color: #f59e0b; font-weight: bold;'
  );
}

export const supabase = isConfigured 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : new MockSupabaseClient();
