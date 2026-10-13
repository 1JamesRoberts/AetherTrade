export function localDateString(timestamp = Date.now()) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function parseTransactionDate(value, context = 'Transaction') {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${context}: Date is missing.`);
  const clean = value.trim();
  let year, month, day;
  const iso = clean.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ].+)?$/);
  const local = clean.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (iso) {
    [, year, month, day] = iso.map(Number);
  } else if (local) {
    [, day, month, year] = local.map(Number);
    if (year < 100) year += 2000;
    if (month > 12 && day <= 12) [day, month] = [month, day];
  } else {
    throw new Error(`${context}: Date must use DD/MM/YYYY or YYYY-MM-DD (optionally with an ISO timestamp).`);
  }
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error(`${context}: Date "${value}" is invalid.`);
  }
  const result = iso && /[T ]/.test(clean) ? new Date(clean.replace(' ', 'T')) : date;
  if (!Number.isFinite(result.getTime())) throw new Error(`${context}: Date "${value}" is invalid.`);
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (result > today) throw new Error(`${context}: Date is in the future.`);
  return result;
}
