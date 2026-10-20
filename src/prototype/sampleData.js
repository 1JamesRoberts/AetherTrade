// Fixed, fictional fixtures. This module has no storage, authentication or API dependencies.
export const assets = [
  { symbol: 'AAPL', name: 'Apple', sector: 'Technology', price: 227.55, change: 1.24, shares: 120, cost: 190, color: '#64748b', cap: '3.42T', pe: '34.8', yield: '0.44%', target: 250 },
  { symbol: 'MSFT', name: 'Microsoft', sector: 'Technology', price: 428.80, change: 0.86, shares: 85, cost: 360, color: '#587eab', cap: '3.19T', pe: '36.2', yield: '0.77%', target: 480 },
  { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', sector: 'Index funds', price: 536.42, change: 0.54, shares: 100, cost: 470, color: '#0d8074', cap: '560B', pe: '27.4', yield: '1.25%', target: null },
  { symbol: 'NVDA', name: 'NVIDIA', sector: 'Technology', price: 138.07, change: -0.72, shares: 140, cost: 105, color: '#94a974', cap: '3.38T', pe: '54.1', yield: '0.03%', target: 165 },
  { symbol: 'ADVANC.BK', name: 'Advanced Info Service', sector: 'Communication', price: 284, change: 0.71, shares: 1500, cost: 245, currency: 'THB', color: '#bd9c69', cap: '844B THB', pe: '25.3', yield: '3.61%', target: 310 },
];
export const portfolios = ['Long-term investing', 'Dividend income'];
export const initialTransactions = [
  { id: 'sample-3', date: '2026-10-14', type: 'BUY', symbol: 'AAPL', shares: 10, price: 225, fees: 1, currency: 'USD', portfolio: portfolios[0] },
  { id: 'sample-2', date: '2026-10-10', type: 'DIVIDEND', symbol: 'VOO', shares: 100, price: 1.81, fees: 27.15, currency: 'USD', portfolio: portfolios[0] },
  { id: 'sample-1', date: '2026-10-08', type: 'SELL', symbol: 'MSFT', shares: 5, price: 425, fees: 1, currency: 'USD', portfolio: portfolios[0] },
];
export const trend = Array.from({ length: 80 }, (_, i) => 25 + i * 0.62 + Math.sin(i * 0.53) * 3 + Math.cos(i * 1.4) * 1.5 - (i > 28 && i < 40 ? (40 - i) * 0.9 : 0));
