from http.server import BaseHTTPRequestHandler
import os
import urllib.parse
import urllib.request
import json
import yfinance as yf

TWELVE_DATA_KEYS = [
    os.environ.get('TWELVE_DATA_KEY_1', ''),
    os.environ.get('TWELVE_DATA_KEY_2', ''),
    os.environ.get('TWELVE_DATA_KEY_3', ''),
    os.environ.get('TWELVE_DATA_KEY_4', ''),
    os.environ.get('TWELVE_DATA_KEY_5', ''),
    os.environ.get('TWELVE_DATA_KEY_6', ''),
    os.environ.get('TWELVE_DATA_KEY_7', '')
]
TWELVE_DATA_KEYS = [k for k in TWELVE_DATA_KEYS if k]

_KEY_INDEX = 0

def get_next_key():
    global _KEY_INDEX
    if not TWELVE_DATA_KEYS:
        return None
    key = TWELVE_DATA_KEYS[_KEY_INDEX]
    _KEY_INDEX = (_KEY_INDEX + 1) % len(TWELVE_DATA_KEYS)
    return key

INTERVAL_MAP = {
    ('1D', '1m'):  ('1min', '390'),
    ('1D', '5m'):  ('5min', '78'),
    ('1D', '15m'): ('15min', '26'),
    ('1D', '1h'):  ('1h', '7'),
    ('1W', '5m'):  ('5min', '390'),
    ('1W', '15m'): ('15min', '130'),
    ('1W', '1h'):  ('1h', '35'),
    ('1W', '1d'):  ('1day', '5'),
    ('1M', '15m'): ('15min', '546'),
    ('1M', '1h'):  ('1h', '150'),
    ('1M', '1d'):  ('1day', '30'),
    ('1M', '1w'):  ('1week', '4'),
    ('1Y', '1d'):  ('1day', '260'),
    ('1Y', '1w'):  ('1week', '52'),
    ('5Y', '1d'):  ('1day', '1260'),
    ('5Y', '1w'):  ('1week', '260'),
}

def fetch_yfinance_timeseries(query_ticker, range_v, interval_v):
    period_map = {
        '1D': ('1d', '15m'),
        '1W': ('5d', '1h'),
        '1M': ('1mo', '1d'),
        '1Y': ('1y', '1wk'),
        '5Y': ('5y', '1wk')
    }
    period, default_int = period_map.get(range_v, ('1mo', '1d'))
    yf_int = interval_v if interval_v else default_int

    int_translation = {
        '1min': '1m', '5min': '5m', '15min': '15m', '1h': '1h',
        '1day': '1d', '1week': '1wk'
    }
    yf_int = int_translation.get(yf_int, yf_int)

    candidates = [query_ticker]
    if not query_ticker.endswith('.BK') and '/' not in query_ticker and '=' not in query_ticker:
        candidates.append(f"{query_ticker}.BK")

    for sym_try in candidates:
        try:
            t_obj = yf.Ticker(sym_try)
            hist = t_obj.history(period=period, interval=yf_int)
            if hist is not None and not hist.empty and len(hist) > 0:
                vals = []
                for row_idx, row in hist.iterrows():
                    if hasattr(row_idx, 'strftime'):
                        if 'm' in yf_int or 'h' in yf_int:
                            dt_str = row_idx.strftime('%Y-%m-%d %H:%M:%S')
                        else:
                            dt_str = row_idx.strftime('%Y-%m-%d')
                    else:
                        dt_str = str(row_idx)
                    vol_raw = row.get('Volume', 0)
                    try:
                        vol_int = int(float(vol_raw)) if vol_raw is not None and str(vol_raw).lower() != 'nan' else 0
                    except Exception:
                        vol_int = 0
                    vals.append({
                        "datetime": dt_str,
                        "open": f"{row['Open']:.4f}",
                        "high": f"{row['High']:.4f}",
                        "low": f"{row['Low']:.4f}",
                        "close": f"{row['Close']:.4f}",
                        "volume": str(vol_int)
                    })
                
                sym_curr = 'THB' if sym_try.endswith('.BK') else 'USD'
                meta_obj = {
                    "symbol": sym_try,
                    "interval": interval_v,
                    "currency": sym_curr,
                    "exchange_timezone": "Asia/Bangkok" if sym_try.endswith('.BK') else "America/New_York",
                    "status": "ok"
                }
                return json.dumps({"meta": meta_obj, "values": vals, "status": "ok"}).encode('utf-8')
        except Exception:
            continue
    return None

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        query_params = urllib.parse.parse_qs(parsed_url.query)
        ticker = query_params.get('ticker', ['AAPL'])[0].upper()
        
        range_val = query_params.get('range', [None])[0]
        interval_val = query_params.get('interval', [None])[0]
        
        if range_val is None or interval_val is None:
            timeframe = query_params.get('timeframe', ['M'])[0]
            if timeframe == 'D':
                range_val, interval_val = '1D', '15m'
            elif timeframe == 'W':
                range_val, interval_val = '1W', '1h'
            elif timeframe == 'M':
                range_val, interval_val = '1M', '1d'
            elif timeframe == 'Y' or timeframe == '1Y':
                range_val, interval_val = '1Y', '1w'
            elif timeframe == '5Y':
                range_val, interval_val = '5Y', '1w'
            else:
                range_val = '1D'
                interval_val = timeframe

        twelve_ticker = ticker
        if ticker == 'BTC-USD':
            twelve_ticker = 'BTC/USD'
        elif ticker == 'EURUSD=X':
            twelve_ticker = 'EUR/USD'
        elif ticker == 'USDTHB=X':
            twelve_ticker = 'USD/THB'

        # If it's a Thai stock (.BK), immediately scrape with yfinance
        if twelve_ticker.endswith('.BK'):
            yf_bytes = fetch_yfinance_timeseries(twelve_ticker, range_val, interval_val)
            if yf_bytes:
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(yf_bytes)
                return
            else:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "message": f"Symbol not found or data fetch failed for {twelve_ticker}"}).encode('utf-8'))
                return

        mapping_key = (range_val, interval_val)
        interval, outputsize = INTERVAL_MAP.get(mapping_key, ('1day', '30'))

        last_error = None
        for _ in range(max(1, len(TWELVE_DATA_KEYS))):
            api_key = get_next_key()
            if not api_key:
                break
            twelve_data_url = (
                f"https://api.twelvedata.com/time_series?"
                f"symbol={twelve_ticker}&interval={interval}&outputsize={outputsize}"
                f"&order=asc&apikey={api_key}"
            )
            try:
                req = urllib.request.Request(twelve_data_url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req, timeout=5) as response:
                    payload = response.read()
                    data = json.loads(payload)
                    if data.get('status') == 'ok':
                        self.send_response(200)
                        self.send_header('Content-Type', 'application/json')
                        self.send_header('Access-Control-Allow-Origin', '*')
                        self.end_headers()
                        self.wfile.write(payload)
                        return
                    else:
                        last_error = data.get('message', 'Twelve Data API Error')
            except Exception as e:
                last_error = str(e)

        # Fallback to yfinance if Twelve Data failed or exhausted
        yf_bytes = fetch_yfinance_timeseries(twelve_ticker, range_val, interval_val)
        if yf_bytes:
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(yf_bytes)
            return

        self.send_response(500)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps({
            "status": "error",
            "message": f"Symbol not found or data fetch failed: {last_error or 'All data sources exhausted'}"
        }).encode('utf-8'))
