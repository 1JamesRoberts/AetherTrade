export const STOCKS_METADATA = [
  { ticker: 'AAPL', name: 'Apple Inc.', price: 185.50, change: 1.45, trend: 'up' },
  { ticker: 'MSFT', name: 'Microsoft Corp.', price: 420.10, change: 0.85, trend: 'up' },
  { ticker: 'NVDA', name: 'NVIDIA Corp.', price: 925.00, change: 4.82, trend: 'up' },
  { ticker: 'TSLA', name: 'Tesla Inc.', price: 178.20, change: -2.31, trend: 'down' },
  { ticker: 'GOOG', name: 'Alphabet Inc.', price: 172.50, change: 1.12, trend: 'up' },
  { ticker: 'AMZN', name: 'Amazon.com Inc.', price: 180.80, change: -0.45, trend: 'down' }
];

export function getTimeframeLabels(interval) {
  switch (interval) {
    case '1m':
      return Array.from({ length: 390 }, (_, i) => {
        const time = new Date(Date.now() - (390 - 1 - i) * 60 * 1000);
        return time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      });
    case '5m':
      return Array.from({ length: 390 }, (_, i) => {
        const time = new Date(Date.now() - (390 - 1 - i) * 5 * 60 * 1000);
        return time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      });
    case '15m':
      return Array.from({ length: 546 }, (_, i) => {
        const time = new Date(Date.now() - (546 - 1 - i) * 15 * 60 * 1000);
        return time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      });
    case '1h':
      return Array.from({ length: 150 }, (_, i) => {
        const time = new Date(Date.now() - (150 - 1 - i) * 60 * 60 * 1000);
        return time.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      });
    case '1d':
      return Array.from({ length: 260 }, (_, i) => {
        const dateObj = new Date(Date.now() - (260 - 1 - i) * 24 * 60 * 60 * 1000);
        return dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      });
    case '1w':
      return Array.from({ length: 52 }, (_, i) => {
        const dateObj = new Date(Date.now() - (52 - 1 - i) * 7 * 24 * 60 * 60 * 1000);
        return dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
      });
    default:
      return [];
  }
}

export function parseStockLabels(values, intervalVal) {
  const closes = [];
  const labels = [];
  const isIntraday = ['1m', '5m', '15m', '1h'].includes(intervalVal);

  values.forEach(item => {
    closes.push(parseFloat(parseFloat(item.close).toFixed(2)));
    const datetime = item.datetime;

    if (isIntraday) {
      const parts = datetime.split(' ');
      const timePart = parts[1] ? parts[1].substring(0, 5) : '';
      const datePart = parts[0];
      if (['1m', '5m', '15m'].includes(intervalVal)) {
        labels.push(timePart || datePart);
      } else {
        const dateObj = new Date(datePart + 'T' + (parts[1] || '00:00:00'));
        labels.push(dateObj.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }));
      }
    } else {
      const datePart = datetime.split(' ')[0];
      const dateObj = new Date(datePart + 'T00:00:00');
      labels.push(dateObj.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        ...(intervalVal !== '1d' && { year: '2-digit' })
      }));
    }
  });

  return { closes, labels };
}
