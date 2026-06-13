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
