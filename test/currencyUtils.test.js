import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  detectTickerCurrency,
  getCurrencySymbol,
  formatMoney,
  convertCurrency
} from '../src/utils/currencyUtils.js';

describe('Currency Utilities Pure Tests', () => {
  it('detectTickerCurrency detects Thai vs US assets', () => {
    assert.strictEqual(detectTickerCurrency('PTT.BK'), 'THB');
    assert.strictEqual(detectTickerCurrency('cpall.bk'), 'THB');
    assert.strictEqual(detectTickerCurrency('KBANK:SET'), 'THB');
    assert.strictEqual(detectTickerCurrency('AAPL'), 'USD');
    assert.strictEqual(detectTickerCurrency('BTC/USD'), 'USD');
    assert.strictEqual(detectTickerCurrency(''), 'USD');
    assert.strictEqual(detectTickerCurrency(null), 'USD');
  });

  it('getCurrencySymbol returns correct symbols', () => {
    assert.strictEqual(getCurrencySymbol('USD'), '$');
    assert.strictEqual(getCurrencySymbol('thb'), '฿');
    assert.strictEqual(getCurrencySymbol(''), '$');
  });

  it('formatMoney formats amounts with currency symbols and negative numbers', () => {
    assert.strictEqual(formatMoney(1234.56, 'USD'), '$1,234.56');
    assert.strictEqual(formatMoney(1234.56, 'THB'), '฿1,234.56');
    assert.strictEqual(formatMoney(-500.25, 'USD'), '-$500.25');
    assert.strictEqual(formatMoney(-500.25, 'THB'), '-฿500.25');
    assert.strictEqual(formatMoney(0, 'USD'), '$0.00');
  });

  it('convertCurrency accurately converts USD and THB both directions', () => {
    const fxRate = 35.0; // 1 USD = 35 THB
    // Same currency -> identity
    assert.strictEqual(convertCurrency(100, 'USD', 'USD', fxRate), 100);
    assert.strictEqual(convertCurrency(100, 'THB', 'THB', fxRate), 100);

    // USD to THB
    assert.strictEqual(convertCurrency(100, 'USD', 'THB', fxRate), 3500);

    // THB to USD
    assert.strictEqual(convertCurrency(3500, 'THB', 'USD', fxRate), 100);
  });
});
