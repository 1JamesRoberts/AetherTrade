/** Presentation policy only. Saved annotations remain arrays of numeric prices. */
export function validLevels(levels = []) {
  return [...new Set(levels.filter(price => typeof price === 'number' && Number.isFinite(price) && price > 0))].sort((a, b) => a - b);
}

export function visibleLevels(levels, currentPrice, mode, selectedPrice = null) {
  const sorted = validLevels(levels);
  if (mode === 'off') return [];
  if (mode === 'all') return sorted;
  const key = new Set();
  if (Number.isFinite(currentPrice) && currentPrice > 0) {
    const support = sorted.filter(price => price <= currentPrice).at(-1);
    const resistance = sorted.find(price => price > currentPrice);
    if (support !== undefined) key.add(support);
    if (resistance !== undefined) key.add(resistance);
  }
  if (sorted.includes(selectedPrice)) key.add(selectedPrice);
  return [...key].sort((a, b) => a - b);
}
