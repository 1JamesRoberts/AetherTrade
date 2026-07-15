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

  select(columns) {
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
    }
    return this;
  }

  order(column, { ascending } = {}) {
    return this;
  }

  insert(data) {
    this.dataToReturn = data;
    return this;
  }

  delete() {
    return this;
  }

  eq(column, value) {
    return this;
  }

  single() {
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

  async signUp({ email, password }) {
    const user = { id: 'mock-user-id', email };
    this.session = { user };
    localStorage.setItem('aethertrade_mock_session', JSON.stringify(this.session));
    this._notify();
    return { data: { user }, error: null };
  }

  async signInWithPassword({ email, password }) {
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
