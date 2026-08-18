/**
 * AetherTrade Multi-Currency Utility System
 * Provides single source of truth for asset currency detection,
 * point-in-time & live FX conversions (USD/THB), and formatted display strings.
 */

/**
 * Detects the native trading currency of a ticker symbol.
 * Thai SET / mai stocks end with .BK or are known Thai assets.
 * @param {string} ticker
 * @returns {'USD' | 'THB'}
 */
export function detectTickerCurrency(ticker) {
  if (!ticker || typeof ticker !== 'string') return 'USD';
  const clean = ticker.trim().toUpperCase();
  if (clean.endsWith('.BK') || clean.endsWith(':SET') || clean.endsWith('.SET')) {
    return 'THB';
  }
  return 'USD';
}

/**
 * Returns the currency symbol for a given currency code.
 * @param {'USD' | 'THB' | string} currency
 * @returns {string} '$' | '฿'
 */
export function getCurrencySymbol(currency) {
  if (!currency) return '$';
  const c = (typeof currency === 'string' ? currency : String(currency || 'USD')).toUpperCase();
  if (c === 'THB') return '฿';
  return '$';
}

/**
 * Formats a monetary number with proper thousand separators and currency symbol.
 * @param {number} amount
 * @param {'USD' | 'THB' | string} currency
 * @param {number} [decimals=2]
 * @returns {string} e.g. "$1,234.56" or "฿1,234.56"
 */
export function formatMoney(amount, currency = 'USD', decimals = 2) {
  const num = typeof amount === 'number' && !isNaN(amount) ? amount : (parseFloat(amount) || 0);
  const isNegative = num < 0;
  const absNum = Math.abs(num);
  const formattedNumber = absNum.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
  const symbol = getCurrencySymbol(currency);
  return `${isNegative ? '-' : ''}${symbol}${formattedNumber}`;
}

/**
 * Converts an amount from one currency to another using the USD/THB exchange rate.
 * fxRate represents THB per 1 USD (e.g. 35.50 means 1 USD = 35.50 THB).
 * @param {number} amount
 * @param {'USD' | 'THB' | string} fromCurrency
 * @param {'USD' | 'THB' | string} toCurrency
 * @param {number} [fxRate=35.5] THB per 1 USD
 * @returns {number}
 */
export function convertCurrency(amount, fromCurrency = 'USD', toCurrency = 'USD', fxRate = 35.5) {
  const num = typeof amount === 'number' && !isNaN(amount) ? amount : (parseFloat(amount) || 0);
  
  let from = (typeof fromCurrency === 'string' ? fromCurrency : String(fromCurrency || 'USD')).toUpperCase();
  let to = (typeof toCurrency === 'string' ? toCurrency : String(toCurrency || 'USD')).toUpperCase();

  if (!from || from.includes('OBJECT') || from === 'UNDEFINED' || from === 'NULL') from = 'USD';
  if (!to || to.includes('OBJECT') || to === 'UNDEFINED' || to === 'NULL') to = 'USD';

  const rate = typeof fxRate === 'number' && fxRate > 0 ? fxRate : (parseFloat(fxRate) || 35.5);

  if (from === to) return num;

  if (from === 'USD' && to === 'THB') {
    return num * rate;
  }

  if (from === 'THB' && to === 'USD') {
    return num / rate;
  }

  return num;
}
