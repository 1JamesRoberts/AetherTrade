import http.server
import urllib.request
import urllib.parse
import json
import os
import sys
import time

try:
    import yfinance as yf
except ImportError:
    yf = None

# Auto-load .env file if it exists
_env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.env')
if os.path.isfile(_env_path):
    with open(_env_path) as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith('#') and '=' in _line:
                _key, _, _val = _line.partition('=')
                os.environ.setdefault(_key.strip(), _val.strip().strip('"').strip("'"))

# Load API keys from environment variables
API_KEYS = [
    os.environ.get('TWELVE_DATA_KEY_1', ''),
    os.environ.get('TWELVE_DATA_KEY_2', ''),
    os.environ.get('TWELVE_DATA_KEY_3', ''),
    os.environ.get('TWELVE_DATA_KEY_4', ''),
    os.environ.get('TWELVE_DATA_KEY_5', ''),
    os.environ.get('TWELVE_DATA_KEY_6', ''),
    os.environ.get('TWELVE_DATA_KEY_7', ''),
]
API_KEYS = [k for k in API_KEYS if k]

key_index = 0

def get_next_api_key():
    global key_index
    if not API_KEYS:
        return ''
    key = API_KEYS[key_index]
    key_index = (key_index + 1) % len(API_KEYS)
    return key

# In-memory TTL caches (TTL = 300 seconds)
_FUNDAMENTALS_CACHE = {}
_STOCK_CACHE = {}
_SEARCH_CACHE = {}

PRIMARY_EXCHANGES = {'NMS', 'NASDAQ', 'NYQ', 'NYSE', 'CME', 'BINANCE', 'CCC', 'BATS', 'ARCX'}

def map_quote_type(qtype):
    if not qtype:
        return 'Stock'
    q = str(qtype).upper()
    if 'ETF' in q or 'MUTUALFUND' in q:
        return 'ETF'
    if 'CRYPTO' in q:
        return 'Crypto'
    if 'CURRENCY' in q or 'FOREX' in q:
        return 'Forex'
    if 'INDEX' in q:
        return 'Index'
    if 'EQUITY' in q or 'STOCK' in q:
        return 'Stock'
    return str(qtype).title()

def search_twelve_data(query):
    key = get_next_api_key()
    if not key:
        return []
    try:
        url = f"https://api.twelvedata.com/symbol_search?symbol={urllib.parse.quote(query)}&apikey={key}"
        req = urllib.request.Request(url, headers={'User-Agent': 'AetherTrade/1.0'})
        with urllib.request.urlopen(req, timeout=4) as response:
            res = json.loads(response.read().decode('utf-8'))
            items = res.get('data', [])
            results = []
            seen_symbols = set()
            for it in items:
                sym = it.get('symbol', '').strip().upper()
                if not sym or sym in seen_symbols:
                    continue
                seen_symbols.add(sym)
                results.append({
                    'symbol': sym,
                    'name': it.get('instrument_name') or sym,
                    'exchange': it.get('exchange') or 'US',
                    'type': map_quote_type(it.get('instrument_type', 'Stock'))
                })
                if len(results) >= 10:
                    break
            return results
    except Exception as e:
        print("Twelve Data fallback search error:", e)
        return []

class StockProxyHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        # Suppress standard high frequency GET terminal printing
        sys.stdout.write("%s - - [%s] %s\n" %
                         (self.address_string(),
                          self.log_date_time_string(),
                          format%args))

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        now = time.time()
        
        # Intercept Proxy Stock Search request
        if parsed_url.path == '/api/stock/search':
            query_params = urllib.parse.parse_qs(parsed_url.query)
            q = query_params.get('q', [''])[0].strip()

            if len(q) < 2:
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'ok', 'data': []}).encode('utf-8'))
                return

            cache_key = q.lower()
            if cache_key in _SEARCH_CACHE:
                cached_time, cached_payload = _SEARCH_CACHE[cache_key]
                if now - cached_time < 300: # 5 min TTL
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(cached_payload)
                    return

            results = []
            if yf is not None:
                try:
                    search_res = yf.Search(q, max_results=15)
                    raw_quotes = search_res.quotes if hasattr(search_res, 'quotes') else []
                    
                    scored_items = []
                    for item in raw_quotes:
                        sym = (item.get('symbol') or '').strip().upper()
                        if not sym:
                            continue
                        name = item.get('longname') or item.get('shortname') or sym
                        exchange = item.get('exchange') or item.get('exchDisp') or 'US'
                        qtype = map_quote_type(item.get('quoteType') or item.get('typeDisp'))
                        
                        score = 0
                        if sym == q.upper():
                            score += 100
                        elif sym.startswith(q.upper()):
                            score += 40
                        
                        if qtype in ('Stock', 'ETF'):
                            score += 30
                        elif qtype == 'Crypto':
                            score += 15

                        if exchange.upper() in PRIMARY_EXCHANGES:
                            score += 25

                        if name.lower().startswith(q.lower()):
                            score += 20
                        elif q.lower() in name.lower():
                            score += 10

                        scored_items.append((score, {
                            'symbol': sym,
                            'name': name,
                            'exchange': exchange,
                            'type': qtype
                        }))

                    scored_items.sort(key=lambda x: x[0], reverse=True)

                    seen_symbols = set()
                    for score, it in scored_items:
                        if it['symbol'] not in seen_symbols:
                            seen_symbols.add(it['symbol'])
                            results.append(it)
                            if len(results) >= 10:
                                break
                except Exception as e:
                    print("yfinance search error in server.py:", e)

            if not results:
                results = search_twelve_data(q)

            payload = json.dumps({'status': 'ok', 'data': results}).encode('utf-8')
            _SEARCH_CACHE[cache_key] = (now, payload)

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(payload)
            return

        # Intercept Proxy Stock Fundamentals request (Live & 100% Free)
        if parsed_url.path == '/api/stock/fundamentals':
            query_params = urllib.parse.parse_qs(parsed_url.query)
            ticker = query_params.get('ticker', ['AAPL'])[0].upper()
            clean_ticker = ticker
            if ticker == 'BTC/USD':
                clean_ticker = 'BTC-USD'
            elif ticker == 'EUR/USD':
                clean_ticker = 'EURUSD=X'

            # Check server-side memory cache first (instant 0ms response)
            if clean_ticker in _FUNDAMENTALS_CACHE:
                cached_time, cached_payload = _FUNDAMENTALS_CACHE[clean_ticker]
                if now - cached_time < 300: # 5 min TTL
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(cached_payload)
                    return

            try:
                if yf is not None:
                    t = yf.Ticker(clean_ticker)
                    info = t.info
                    
                    market_cap_raw = info.get('marketCap')
                    if market_cap_raw:
                        if market_cap_raw >= 1e12:
                            market_cap_fmt = f"${market_cap_raw / 1e12:.2f}T"
                        elif market_cap_raw >= 1e9:
                            market_cap_fmt = f"${market_cap_raw / 1e9:.2f}B"
                        elif market_cap_raw >= 1e6:
                            market_cap_fmt = f"${market_cap_raw / 1e6:.2f}M"
                        else:
                            market_cap_fmt = f"${market_cap_raw:,.0f}"
                    else:
                        market_cap_fmt = 'N/A'

                    pe_val = info.get('trailingPE')
                    pe_fmt = f"{pe_val:.1f}x" if pe_val else 'N/A'
                    
                    fpe_val = info.get('forwardPE')
                    fpe_fmt = f"{fpe_val:.1f}x" if fpe_val else 'N/A'

                    eps_val = info.get('trailingEps')
                    eps_fmt = f"${eps_val:.2f}" if eps_val is not None else 'N/A'

                    div_yield = info.get('dividendYield')
                    if div_yield is not None:
                        div_fmt = f"{float(div_yield):.2f}%"
                    else:
                        div_fmt = '0.00%'

                    avg_vol = info.get('averageVolume10days') or info.get('averageVolume') or info.get('volume')
                    if avg_vol:
                        avg_vol_num = float(avg_vol)
                        avg_vol_fmt = f"{avg_vol_num / 1e6:.1f}M" if avg_vol_num >= 1e6 else f"{avg_vol_num / 1e3:.0f}K"
                    else:
                        avg_vol_fmt = 'N/A'

                    beta_val = info.get('beta')
                    beta_fmt = f"{beta_val:.2f}" if beta_val is not None else '1.00'

                    shares_out = info.get('sharesOutstanding')
                    if shares_out:
                        shares_out_num = float(shares_out)
                        shares_out_fmt = f"{shares_out_num / 1e9:.2f}B" if shares_out_num >= 1e9 else f"{shares_out_num / 1e6:.1f}M"
                    else:
                        shares_out_fmt = 'N/A'

                    low52 = info.get('fiftyTwoWeekLow') or 0
                    high52 = info.get('fiftyTwoWeekHigh') or 0

                    officers = info.get('companyOfficers', [])
                    ceo_name = officers[0].get('name') if officers else 'Executive Management'

                    hq_parts = [info.get('city'), info.get('state'), info.get('country')]
                    hq_str = ", ".join([p for p in hq_parts if p]) or 'United States'

                    employees_val = info.get('fullTimeEmployees')
                    employees_fmt = f"{int(employees_val):,}" if employees_val else 'Corporate'

                    rec_key = info.get('recommendationKey', '')
                    rec_key_fmt = rec_key.replace('_', ' ').title() if rec_key else 'Hold'

                    target_low = info.get('targetLowPrice')
                    target_mean = info.get('targetMeanPrice')
                    target_high = info.get('targetHighPrice')
                    num_analysts = info.get('numberOfAnalystOpinions') or 0

                    analyst_breakdown = {"strongBuy": 0, "buy": 0, "hold": 0, "sell": 0, "strongSell": 0}
                    try:
                        recs = t.recommendations
                        if recs is not None and not recs.empty:
                            row = recs.iloc[0]
                            analyst_breakdown = {
                                "strongBuy": int(row.get('strongBuy', 0)),
                                "buy": int(row.get('buy', 0)),
                                "hold": int(row.get('hold', 0)),
                                "sell": int(row.get('sell', 0)),
                                "strongSell": int(row.get('strongSell', 0))
                            }
                    except Exception:
                        pass

                    payload_obj = {
                        "status": "ok",
                        "symbol": ticker,
                        "name": info.get('shortName') or info.get('longName') or f"{ticker} Stock",
                        "sector": info.get('sector') or 'Equity Market',
                        "industry": info.get('industry') or 'Public Company',
                        "ceo": ceo_name,
                        "headquarters": hq_str,
                        "employees": employees_fmt,
                        "website": info.get('website', ''),
                        "description": info.get('longBusinessSummary', ''),
                        "marketCap": market_cap_fmt,
                        "marketCapRaw": market_cap_raw,
                        "peRatio": pe_fmt,
                        "forwardPE": fpe_fmt,
                        "eps": eps_fmt,
                        "dividendYield": div_fmt,
                        "avgVolume30D": avg_vol_fmt,
                        "beta": beta_fmt,
                        "sharesOutstanding": shares_out_fmt,
                        "fiftyTwoWeekLow": low52,
                        "fiftyTwoWeekHigh": high52,
                        "recommendationKey": rec_key_fmt,
                        "numberOfAnalysts": num_analysts,
                        "targetLow": target_low,
                        "targetMean": target_mean,
                        "targetHigh": target_high,
                        "analystBreakdown": analyst_breakdown,
                        "isLiveApi": True
                    }

                    payload_bytes = json.dumps(payload_obj).encode('utf-8')
                    _FUNDAMENTALS_CACHE[clean_ticker] = (now, payload_bytes)

                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(payload_bytes)
                    return
            except Exception as e:
                print(f"yfinance error for {ticker}: {e}")
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"error": f"Failed to fetch fundamentals for {ticker}: {str(e)}"}).encode('utf-8'))
                return

        # Intercept Proxy Stock request
        if parsed_url.path == '/api/stock':
            query_params = urllib.parse.parse_qs(parsed_url.query)
            ticker = query_params.get('ticker', ['AAPL'])[0].upper()
            
            # Read range and interval, fallback to timeframe if they are missing
            range_val = query_params.get('range', [None])[0]
            interval_val = query_params.get('interval', [None])[0]
            
            if range_val is None or interval_val is None:
                # Handle fallback to old timeframe parameter
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
                    # e.g. timeframe = '1m', '5m', '15m', '1h'
                    range_val = '1D'
                    interval_val = timeframe
            
            # Sanitize cryptocurrency and forex indicators for Twelve Data (e.g. BTC-USD to BTC/USD)
            clean_cache_key = f"{ticker}_{range_val}_{interval_val}"
            
            # Fast memory cache check for stock prices (15s TTL)
            if clean_cache_key in _STOCK_CACHE:
                cached_time, cached_payload = _STOCK_CACHE[clean_cache_key]
                if now - cached_time < 15:
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(cached_payload)
                    return

            if ticker == 'BTC-USD':
                ticker = 'BTC/USD'
            elif ticker == 'EURUSD=X':
                ticker = 'EUR/USD'
            
            # Map combinations of Range and Interval to Twelve Data interval & outputsize
            MAPPING = {
                ('1D', '1m'): ('1min', '390'),
                ('1D', '5m'): ('5min', '78'),
                ('1D', '15m'): ('15min', '26'),
                ('1D', '1h'): ('1h', '7'),
                
                ('1W', '5m'): ('5min', '390'),
                ('1W', '15m'): ('15min', '130'),
                ('1W', '1h'): ('1h', '35'),
                ('1W', '1d'): ('1day', '7'),
                
                ('1M', '15m'): ('15min', '500'),
                ('1M', '1h'): ('1h', '150'),
                ('1M', '1d'): ('1day', '30'),
                ('1M', '1w'): ('1week', '5'),
                
                ('1Y', '1d'): ('1day', '260'),
                ('1Y', '1w'): ('1week', '52'),

                ('5Y', '1d'): ('1day', '1260'),
                ('5Y', '1w'): ('1week', '260'),
            }
            
            mapped_interval, mapped_outputsize = MAPPING.get((range_val, interval_val), ('1day', '30'))
            
            data = None
            last_error = None
            
            # Rotate through all available API keys in case one is rate limited (8 req/min on free tier)
            for _ in range(len(API_KEYS)):
                key = get_next_api_key()
                url = f"https://api.twelvedata.com/time_series?symbol={ticker}&interval={mapped_interval}&outputsize={mapped_outputsize}&order=asc&apikey={key}"
                
                try:
                    req = urllib.request.Request(
                        url, 
                        headers={'User-Agent': 'Mozilla/5.0'}
                    )
                    with urllib.request.urlopen(req) as response:
                        res_data = response.read()
                        res_json = json.loads(res_data.decode('utf-8'))
                        
                        # Twelve Data returns 200 OK even for key limits, so we check status field!
                        if res_json.get('status') == 'ok':
                            data = res_data
                            break
                        else:
                            last_error = res_json.get('message', 'Twelve Data API Error')
                except Exception as e:
                    last_error = str(e)
                    continue
            
            if data is not None:
                _STOCK_CACHE[clean_cache_key] = (now, data)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(data)
                return
            else:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                error_response = json.dumps({"error": f"Twelve Data failed: {last_error}"}).encode('utf-8')
                self.wfile.write(error_response)
                return
                
        # Serve static assets normally
        super().do_GET()

if __name__ == '__main__':
    # Pin working directory to project root (parent directory of server/)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.abspath(os.path.join(script_dir, '..'))
    os.chdir(project_root)
    
    port = 8080
    print(f"Starting AetherTrade Multi-Threaded Server at http://localhost:{port}...")
    # Use ThreadingHTTPServer for concurrent non-blocking requests
    server = http.server.ThreadingHTTPServer(('0.0.0.0', port), StockProxyHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
        server.server_close()
