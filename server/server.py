import http.server
import urllib.request
import urllib.parse
import json
import os
import sys

# User-provided Twelve Data API keys for dynamic key rotation
API_KEYS = [
    'd9689515957d4d55bd1fa2a8cf110dbc',
    '9ec5eba69f55455990d611d57a5adad4',
    'e91b963bb3d54ca9aa260c575b2a834d',
    'fa6f354384cd4a2fb05e63ece7fd1c42'
]
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
            timeframe = query_params.get('timeframe', ['M'])[0]
            
            # Sanitize cryptocurrency and forex indicators for Twelve Data (e.g. BTC-USD to BTC/USD)
            if ticker == 'BTC-USD':
                ticker = 'BTC/USD'
            elif ticker == 'EURUSD=X':
                ticker = 'EUR/USD'
            
            # Map timeframes to Twelve Data standard time series intervals & sizes
            interval = '1day'
            outputsize = '30'
            
            if timeframe == 'D':
                interval = '15min'
                outputsize = '26'  # covers 6.5 hours of trading candles
            elif timeframe == 'W':
                interval = '2h'
                outputsize = '35'  # 7 candles per day * 5 days
            elif timeframe == 'M':
                interval = '1day'
                outputsize = '30'
            elif timeframe == 'Y':
                interval = '1week'
                outputsize = '52'
                
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
