from http.server import BaseHTTPRequestHandler
import urllib.parse
import urllib.request
import json
import os

try:
    import yfinance as yf
except ImportError:
    yf = None

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
_key_index = 0

def get_next_api_key():
    global _key_index
    if not API_KEYS:
        return ''
    key = API_KEYS[_key_index]
    _key_index = (_key_index + 1) % len(API_KEYS)
    return key

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
    if not API_KEYS:
        return []
    max_attempts = min(len(API_KEYS), 7)
    for _ in range(max_attempts):
        key = get_next_api_key()
        if not key:
            continue
        try:
            url = f"https://api.twelvedata.com/symbol_search?symbol={urllib.parse.quote(query)}&apikey={key}"
            req = urllib.request.Request(url, headers={'User-Agent': 'AetherTrade/1.0'})
            with urllib.request.urlopen(req, timeout=4) as response:
                res = json.loads(response.read().decode('utf-8'))
                if res.get('code') == 429 or 'api_key' in str(res.get('message', '')).lower():
                    continue
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
            continue
    return []

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        query_params = urllib.parse.parse_qs(parsed_url.query)
        q = query_params.get('q', [''])[0].strip()

        if len(q) < 2:
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'ok', 'data': []}).encode('utf-8'))
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
                    
                    # Compute relevance ranking score
                    score = 0
                    if sym == q.upper() or sym == f"{q.upper()}.BK":
                        score += 100
                    elif sym.startswith(q.upper()):
                        score += 40
                    
                    if qtype in ('Stock', 'ETF'):
                        score += 30
                    elif qtype == 'Crypto':
                        score += 15

                    if exchange.upper() in PRIMARY_EXCHANGES:
                        score += 25
                    elif exchange.upper() in ('SET', 'MAI', 'BKK', 'THAILAND') or sym.endswith('.BK'):
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

                # Sort by score descending
                scored_items.sort(key=lambda x: x[0], reverse=True)

                # Deduplicate by symbol
                seen_symbols = set()
                for score, it in scored_items:
                    if it['symbol'] not in seen_symbols:
                        seen_symbols.add(it['symbol'])
                        results.append(it)
                        if len(results) >= 10:
                            break
            except Exception as e:
                print("yfinance search error:", e)

        # Fallback to Twelve Data if yfinance had no matches or failed
        if not results:
            results = search_twelve_data(q)

        payload = json.dumps({'status': 'ok', 'data': results})

        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'public, max-age=300, s-maxage=300')
        self.end_headers()
        self.wfile.write(payload.encode('utf-8'))
