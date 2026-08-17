import http.server
import urllib.request
import urllib.parse
import json
import os
import sys

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
current_key_index = 0

def get_next_api_key():
    global current_key_index
    key = API_KEYS[current_key_index]
    current_key_index = (current_key_index + 1) % len(API_KEYS)
    return key

class StockProxyHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        # Suppress standard high frequency GET terminal printing
        sys.stdout.write("%s - - [%s] %s\n" %
                         (self.address_string(),
                          self.log_date_time_string(),
                          format%args))

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        
        # Intercept Proxy Stock Fundamentals request
        if parsed_url.path == '/api/stock/fundamentals':
            query_params = urllib.parse.parse_qs(parsed_url.query)
            ticker = query_params.get('ticker', ['AAPL'])[0].upper()
            if ticker == 'BTC-USD':
                ticker = 'BTC/USD'
            elif ticker == 'EURUSD=X':
                ticker = 'EUR/USD'

            endpoints = [
                ('profile', f"https://api.twelvedata.com/profile?symbol={ticker}"),
                ('quote', f"https://api.twelvedata.com/quote?symbol={ticker}"),
                ('statistics', f"https://api.twelvedata.com/statistics?symbol={ticker}")
            ]
            
            results = {}
            last_error = None
            for ep_name, ep_base in endpoints:
                for _ in range(len(API_KEYS)):
                    key = get_next_api_key()
                    url = f"{ep_base}&apikey={key}"
                    try:
                        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                        with urllib.request.urlopen(req) as response:
                            res_json = json.loads(response.read().decode('utf-8'))
                            if res_json.get('code') != 400 and res_json.get('status') != 'error':
                                results[ep_name] = res_json
                                break
                            else:
                                last_error = res_json.get('message', 'API Error')
                    except Exception as e:
                        last_error = str(e)
                        continue

            if 'profile' in results or 'quote' in results or 'statistics' in results:
                prof = results.get('profile', {})
                quo = results.get('quote', {})
                st = results.get('statistics', {}).get('statistics', {})
                val = st.get('valuations_metrics', {}) if isinstance(st, dict) else {}
                fin = st.get('financials', {}) if isinstance(st, dict) else {}
                stock_stats = st.get('stock_statistics', {}) if isinstance(st, dict) else {}
                price_sum = st.get('stock_price_summary', {}) if isinstance(st, dict) else {}
                divs = st.get('dividends_and_splits', {}) if isinstance(st, dict) else {}

                # Format market cap
                market_cap_raw = val.get('market_capitalization')
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

                # Format PE
                pe_val = val.get('trailing_pe')
                pe_fmt = f"{pe_val:.1f}x" if pe_val else 'N/A'
                fpe_val = val.get('forward_pe')
                fpe_fmt = f"{fpe_val:.1f}x" if fpe_val else 'N/A'

                # Format EPS
                eps_val = fin.get('income_statement', {}).get('diluted_eps_ttm') if isinstance(fin, dict) else None
                eps_fmt = f"${eps_val:.2f}" if eps_val is not None else 'N/A'

                # Format Dividend Yield
                div_yield = divs.get('trailing_annual_dividend_yield') or divs.get('forward_annual_dividend_yield')
                div_fmt = f"{div_yield * 100:.2f}%" if div_yield else '0.00%'

                # Format Avg Volume
                avg_vol = quo.get('average_volume') or (stock_stats.get('avg_30_volume') if isinstance(stock_stats, dict) else None)
                if avg_vol:
                    avg_vol_num = float(avg_vol)
                    avg_vol_fmt = f"{avg_vol_num / 1e6:.1f}M" if avg_vol_num >= 1e6 else f"{avg_vol_num / 1e3:.0f}K"
                else:
                    avg_vol_fmt = 'N/A'

                # Format Beta
                beta_val = price_sum.get('beta') if isinstance(price_sum, dict) else None
                beta_fmt = f"{beta_val:.2f}" if beta_val is not None else '1.00'

                # Format Shares Out
                shares_out = stock_stats.get('shares_outstanding') if isinstance(stock_stats, dict) else None
                if shares_out:
                    shares_out_num = float(shares_out)
                    shares_out_fmt = f"{shares_out_num / 1e9:.2f}B" if shares_out_num >= 1e9 else f"{shares_out_num / 1e6:.1f}M"
                else:
                    shares_out_fmt = 'N/A'

                # 52W range
                fifty_two = quo.get('fifty_two_week', {}) if isinstance(quo, dict) else {}
                low52 = float(fifty_two.get('low', 0)) if fifty_two.get('low') else ((price_sum.get('fifty_two_week_low', 0) if isinstance(price_sum, dict) else 0))
                high52 = float(fifty_two.get('high', 0)) if fifty_two.get('high') else ((price_sum.get('fifty_two_week_high', 0) if isinstance(price_sum, dict) else 0))

                hq_parts = [prof.get('city'), prof.get('state'), prof.get('country')]
                hq_str = ", ".join([p for p in hq_parts if p]) or 'United States'

                payload = {
                    "status": "ok",
                    "symbol": ticker,
                    "name": prof.get('name') or quo.get('name') or f"{ticker} Stock",
                    "sector": prof.get('sector') or 'Equity Market',
                    "industry": prof.get('industry') or 'Public Company',
                    "ceo": prof.get('CEO') or 'Executive Management',
                    "headquarters": hq_str,
                    "employees": f"{int(prof.get('employees', 0)):,}" if prof.get('employees') else 'Corporate',
                    "website": prof.get('website', ''),
                    "description": prof.get('description', ''),
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
                    "isLiveApi": True
                }
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps(payload).encode('utf-8'))
                return
            else:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": f"Twelve Data fundamentals failed: {last_error}"}).encode('utf-8'))
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
                ('1W', '1d'): ('1day', '5'),
                
                ('1M', '15m'): ('15min', '546'),
                ('1M', '1h'): ('1h', '150'),
                ('1M', '1d'): ('1day', '30'),
                ('1M', '1w'): ('1week', '4'),
                
                ('1Y', '1d'): ('1day', '260'),
                ('1Y', '1w'): ('1week', '52'),

                ('5Y', '1d'): ('1day', '1260'),
                ('5Y', '1w'): ('1week', '260'),
            }
            
            mapping_key = (range_val, interval_val)
            if mapping_key in MAPPING:
                interval, outputsize = MAPPING[mapping_key]
            else:
                interval, outputsize = '1day', '30'
                
            data = None
            last_error = None
            
            # Rotate through all available API keys in case one is rate limited (8 req/min on free tier)
            for _ in range(len(API_KEYS)):
                key = get_next_api_key()
                url = f"https://api.twelvedata.com/time_series?symbol={ticker}&interval={interval}&outputsize={outputsize}&order=asc&apikey={key}"
                
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
    print(f"Starting AetherTrade on Twelve Data at http://localhost:{port}...")
    server = http.server.HTTPServer(('0.0.0.0', port), StockProxyHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
        server.server_close()
