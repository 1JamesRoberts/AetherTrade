const API_KEYS = [
  process.env.TWELVE_DATA_KEY_1,
  process.env.TWELVE_DATA_KEY_2,
  process.env.TWELVE_DATA_KEY_3,
  process.env.TWELVE_DATA_KEY_4,
  process.env.TWELVE_DATA_KEY_5,
  process.env.TWELVE_DATA_KEY_6,
  process.env.TWELVE_DATA_KEY_7,
].filter(Boolean);

let currentKeyIndex = 0;

function getNextKey() {
  const key = API_KEYS[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
  return key;
}

const MAPPING = {
  '1D,1m':  { interval: '1min',  outputsize: '390' },
  '1D,5m':  { interval: '5min',  outputsize: '78' },
  '1D,15m': { interval: '15min', outputsize: '26' },
  '1D,1h':  { interval: '1h',    outputsize: '7' },
  '1W,5m':  { interval: '5min',  outputsize: '390' },
  '1W,15m': { interval: '15min', outputsize: '130' },
  '1W,1h':  { interval: '1h',    outputsize: '35' },
  '1W,1d':  { interval: '1day',  outputsize: '5' },
  '1M,15m': { interval: '15min', outputsize: '546' },
  '1M,1h':  { interval: '1h',    outputsize: '150' },
  '1M,1d':  { interval: '1day',  outputsize: '30' },
  '1M,1w':  { interval: '1week', outputsize: '4' },
  '1Y,1d':  { interval: '1day',  outputsize: '260' },
  '1Y,1w':  { interval: '1week', outputsize: '52' },
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { ticker: rawTicker = 'AAPL', range: rangeVal, interval: intervalVal } = req.query;
  let ticker = rawTicker.toUpperCase();

  if (ticker === 'BTC-USD') ticker = 'BTC/USD';
  else if (ticker === 'EURUSD=X') ticker = 'EUR/USD';

  const mappingKey = `${rangeVal},${intervalVal}`;
  const { interval, outputsize } = MAPPING[mappingKey] || { interval: '1day', outputsize: '30' };

  let lastError = null;

  for (let i = 0; i < API_KEYS.length; i++) {
    const key = getNextKey();
    const url = `https://api.twelvedata.com/time_series?symbol=${ticker}&interval=${interval}&outputsize=${outputsize}&order=asc&apikey=${key}`;

    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const data = await response.json();

      if (data.status === 'ok') {
        return res.status(200).json(data);
      }
      lastError = data.message || 'Twelve Data API Error';
    } catch (err) {
      lastError = err.message;
    }
  }

  return res.status(500).json({ error: `Twelve Data failed: ${lastError}` });
}
