/** Missing volume is a gap; a reported zero remains a real zero. */
export function calculateVolumeData(data, rawValues) {
  if (!data?.length) return [];
  return data.map((item, index) => {
    const raw = Object.hasOwn(item, 'volume') ? item.volume : rawValues[index]?.volume;
    const volume = raw === null || raw === undefined || raw === '' ? NaN : Number(raw);
    if (!Number.isFinite(volume) || volume < 0) return { time: item.time };
    return { time: item.time, value: volume,
      color: item.close >= item.open ? 'rgba(16, 185, 129, 0.45)' : 'rgba(244, 63, 94, 0.45)' };
  });
}

/** Portable numeric axis labels without mixed-script text or Intl compact formatting. */
export function formatPerformanceAxisValue(value, currency = 'USD') {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '';
  const magnitude = Math.abs(amount);
  const units = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  let divisor = 1;
  let suffix = '';
  if (magnitude >= 10000) {
    const unit = units.find(([threshold]) => magnitude >= threshold);
    [divisor, suffix] = unit;
  }
  // Avoid Intl compact notation: unit selection and digits are explicit across engines.
  const decimals = magnitude > 0 && magnitude < 1 ? 4 : 2;
  const digits = (magnitude / divisor).toFixed(decimals).replace(/\.?0+$/, '');
  const sign = amount < 0 ? '-' : amount > 0 ? '+' : '';
  const prefix = currency === 'THB' ? 'THB ' : '$';
  return `${sign}${prefix}${digits}${suffix}`;
}
