import http.server
import urllib.request
import urllib.parse
import json
import os
import sys

# Load API keys from environment variables
API_KEYS = [
    os.environ.get('TWELVE_DATA_KEY_1', ''),
    os.environ.get('TWELVE_DATA_KEY_2', ''),
    os.environ.get('TWELVE_DATA_KEY_3', ''),
    os.environ.get('TWELVE_DATA_KEY_4', ''),
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
                elif timeframe == 'Y':
                    range_val, interval_val = '1Y', '1w'
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
