"""Production stock endpoint regressions; no network requests or API keys required."""
import ast
import importlib.util
import io
import json
from datetime import datetime
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('stock_api', ROOT / 'api/stock.py')
stock = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stock)

class History:
    empty = False
    def __len__(self): return 1
    def iterrows(self):
        yield datetime(2025, 1, 2, 14, 30), {'Open': 100, 'High': 110, 'Low': 90, 'Close': 105, 'Volume': 0}

class StockApiTests(unittest.TestCase):
    def test_every_weekly_range_translates_to_yahoo_weekly(self):
        for range_value in ['1M', '1Y', '5Y']:
            with self.subTest(range=range_value), patch.object(stock.yf, 'Ticker') as ticker:
                ticker.return_value.history.return_value = History()
                payload = json.loads(stock.fetch_yfinance_timeseries('PTT.BK', range_value, '1w'))
                self.assertEqual(ticker.return_value.history.call_args.kwargs['interval'], '1wk')
                self.assertEqual(payload['values'][0]['datetime'], '2025-01-02')
                self.assertEqual(payload['values'][0]['volume'], '0')

    def test_fallback_receives_original_yahoo_fx_and_crypto_symbols(self):
        for symbol in ['USDTHB=X', 'EURUSD=X', 'BTC-USD']:
            with self.subTest(symbol=symbol), patch.object(stock, 'TWELVE_DATA_KEYS', []), patch.object(stock.yf, 'Ticker') as ticker:
                ticker.return_value.history.return_value = History()
                handler = stock.handler.__new__(stock.handler)
                handler.path = f'/api/stock?ticker={symbol}&range=1Y&interval=1w'
                handler.wfile = io.BytesIO()
                handler.send_response = lambda status: self.assertEqual(status, 200)
                headers = {}
                handler.send_header = lambda key, value: headers.update({key: value})
                handler.end_headers = lambda: None
                handler.do_GET()
                ticker.assert_called_once_with(symbol)
                self.assertEqual(json.loads(handler.wfile.getvalue())['status'], 'ok')
                self.assertIn('s-maxage=15', headers['Cache-Control'])

    def test_unfinished_nan_rows_are_filtered_and_empty_valid_series_is_rejected(self):
        class PartialHistory(History):
            def iterrows(self):
                yield from super().iterrows()
                yield datetime(2025, 1, 3), {'Open': float('nan'), 'High': float('nan'), 'Low': float('nan'), 'Close': float('nan')}
        class InvalidHistory(PartialHistory):
            def iterrows(self):
                yield list(super().iterrows())[-1]
        with patch.object(stock.yf, 'Ticker') as ticker:
            ticker.return_value.history.return_value = PartialHistory()
            payload = json.loads(stock.fetch_yfinance_timeseries('PTT.BK', '1M', '1d'))
            self.assertEqual(len(payload['values']), 1)
            self.assertEqual(float(payload['values'][-1]['close']), 105)
            ticker.return_value.history.return_value = InvalidHistory()
            self.assertIsNone(stock.fetch_yfinance_timeseries('PTT.BK', '1M', '1d'))

    def test_unqualified_symbols_do_not_silently_return_a_different_thai_asset(self):
        with patch.object(stock.yf, 'Ticker') as ticker:
            ticker.return_value.history.return_value = None
            self.assertIsNone(stock.fetch_yfinance_timeseries('UNKNOWN', '1M', '1d'))
            ticker.assert_called_once_with('UNKNOWN')

    def test_local_and_production_twelve_data_mappings_match(self):
        tree = ast.parse((ROOT / 'server/server.py').read_text())
        mapping = next(ast.literal_eval(node.value) for node in ast.walk(tree)
                       if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'MAPPING' for t in node.targets))
        self.assertEqual(stock.INTERVAL_MAP, mapping)

if __name__ == '__main__':
    unittest.main()
