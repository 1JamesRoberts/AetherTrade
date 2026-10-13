import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatPerformanceAxisValue } from '../src/utils/chartUtils.js';

test('axis numbers remain present without browser Intl compact-number formatting', () => {
  const original = Number.prototype.toLocaleString;
  Number.prototype.toLocaleString = () => { throw new Error('Browser compact formatting unavailable'); };
  try {
    assert.equal(formatPerformanceAxisValue(0, 'THB'), 'THB 0');
    assert.equal(formatPerformanceAxisValue(20000, 'THB'), '+THB 20K');
    assert.equal(formatPerformanceAxisValue(-2500000, 'THB'), '-THB 2.5M');
    assert.equal(formatPerformanceAxisValue(0.005, 'THB'), '+THB 0.005');
    assert.equal(formatPerformanceAxisValue(1500, 'USD'), '+$1500');
    assert.equal(formatPerformanceAxisValue(Infinity, 'THB'), '');
  } finally { Number.prototype.toLocaleString = original; }
});
