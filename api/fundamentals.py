from http.server import BaseHTTPRequestHandler
import urllib.parse
import json
import yfinance as yf

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        query_params = urllib.parse.parse_qs(parsed_url.query)
        ticker = query_params.get('ticker', ['AAPL'])[0].upper()
        clean_ticker = ticker
        if ticker == 'BTC/USD':
            clean_ticker = 'BTC-USD'
        elif ticker == 'EUR/USD':
            clean_ticker = 'EURUSD=X'
        elif ticker == 'USD/THB':
            clean_ticker = 'USDTHB=X'

        try:
            t = yf.Ticker(clean_ticker)
            info = t.info

            currency = 'THB' if clean_ticker.endswith('.BK') or info.get('currency') == 'THB' else 'USD'
            curr_sym = '฿' if currency == 'THB' else '$'

            market_cap_raw = info.get('marketCap')
            if market_cap_raw:
                if market_cap_raw >= 1e12:
                    market_cap_fmt = f"{curr_sym}{market_cap_raw / 1e12:.2f}T"
                elif market_cap_raw >= 1e9:
                    market_cap_fmt = f"{curr_sym}{market_cap_raw / 1e9:.2f}B"
                elif market_cap_raw >= 1e6:
                    market_cap_fmt = f"{curr_sym}{market_cap_raw / 1e6:.2f}M"
                else:
                    market_cap_fmt = f"{curr_sym}{market_cap_raw:,.0f}"
            else:
                market_cap_fmt = 'N/A'

            pe_val = info.get('trailingPE')
            pe_fmt = f"{pe_val:.1f}x" if pe_val else 'N/A'
            
            fpe_val = info.get('forwardPE')
            fpe_fmt = f"{fpe_val:.1f}x" if fpe_val else 'N/A'

            eps_val = info.get('trailingEps')
            eps_fmt = f"{curr_sym}{eps_val:.2f}" if eps_val is not None else 'N/A'

            div_yield = info.get('dividendYield')
            div_fmt = f"{float(div_yield):.2f}%" if div_yield is not None else '0.00%'

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
            hq_str = ", ".join([p for p in hq_parts if p]) or ('Thailand' if clean_ticker.endswith('.BK') else 'United States')

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
                "currency": currency,
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

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', 's-maxage=300, stale-while-revalidate=60')
            self.end_headers()
            self.wfile.write(json.dumps(payload_obj).encode('utf-8'))
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"error": f"Failed to fetch fundamentals: {str(e)}"}).encode('utf-8'))
