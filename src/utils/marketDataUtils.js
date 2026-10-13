/** Providers may include a partial candle with NaN prices. Keep only usable OHLC rows. */
export function validStockValues(values) {
  if (!Array.isArray(values)) return [];
  return values.filter(row => typeof row?.datetime === 'string' && row.datetime &&
    ['open', 'high', 'low', 'close'].every(field => Number.isFinite(Number(row[field])) && Number(row[field]) > 0));
}
