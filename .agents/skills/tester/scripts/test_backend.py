#!/usr/bin/env python3
import urllib.request
import json
import sys

BASE_URL = "http://127.0.0.1:8080/api/stock"

def test_endpoint(ticker, expected_status, is_valid_symbol=True):
    url = f"{BASE_URL}?ticker={ticker}&timeframe=M"
    print(f"[TEST] Querying: {url}")
    
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            status = response.getcode()
            body = response.read().decode('utf-8')
            res_json = json.loads(body)
            
            if status != expected_status:
                print(f"  [\u001b[31mFAIL\u001b[0m] Expected status code {expected_status}, but got {status}")
                return False
                
            if is_valid_symbol:
                if res_json.get('status') != 'ok':
                    print(f"  [\u001b[31mFAIL\u001b[0m] Expected status 'ok' in payload, got: {res_json}")
                    return False
                if 'values' not in res_json or len(res_json['values']) == 0:
                    print(f"  [\u001b[31mFAIL\u001b[0m] Missing or empty 'values' array in response")
                    return False
                print(f"  [\u001b[32mPASS\u001b[0m] Fetched valid stock {ticker}. Price close: {res_json['values'][-1].get('close')}")
                return True
            else:
                # Should not get 200 for invalid symbol
                print(f"  [\u001b[31mFAIL\u001b[0m] Expected status 500 for invalid symbol {ticker}, but got 200 OK")
                return False
                
    except urllib.error.HTTPError as e:
        status = e.code
        body = e.read().decode('utf-8')
        try:
            res_json = json.loads(body)
        except Exception:
            res_json = {}
            
        if status != expected_status:
            print(f"  [\u001b[31mFAIL\u001b[0m] Expected status code {expected_status}, but got {status} ({e.reason})")
            return False
            
        if not is_valid_symbol:
            error_msg = res_json.get('error', '')
            if 'Twelve Data failed' in error_msg or 'not found' in error_msg.lower():
                print(f"  [\u001b[32mPASS\u001b[0m] Invalid symbol rejected correctly with 500. Message: {error_msg}")
                return True
            else:
                print(f"  [\u001b[31mFAIL\u001b[0m] Error message did not mention Twelve Data failure or symbol rejection: {error_msg}")
                return False
        else:
            print(f"  [\u001b[31mFAIL\u001b[0m] Valid symbol {ticker} failed with HTTPError: {status} ({e.reason})")
            return False
            
    except Exception as e:
        print(f"  [\u001b[31mFAIL\u001b[0m] Request failed with unexpected error: {str(e)}")
        return False

def test_search(query, expected_symbol="AAPL"):
    url = f"http://127.0.0.1:8080/api/stock/search?q={urllib.parse.quote(query)}"
    print(f"[TEST] Querying Search: {url}")
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            status = response.getcode()
            body = response.read().decode('utf-8')
            res_json = json.loads(body)
            if status != 200:
                print(f"  [\u001b[31mFAIL\u001b[0m] Expected status 200, got {status}")
                return False
            data = res_json.get('data', [])
            if not isinstance(data, list) or len(data) == 0:
                print(f"  [\u001b[31mFAIL\u001b[0m] Search returned empty results for '{query}'")
                return False
            has_symbol = any(item.get('symbol') == expected_symbol for item in data)
            if not has_symbol:
                print(f"  [\u001b[31mFAIL\u001b[0m] Expected symbol {expected_symbol} not found in search results: {data}")
                return False
            print(f"  [\u001b[32mPASS\u001b[0m] Search found {len(data)} results including {expected_symbol}")
            return True
    except Exception as e:
        print(f"  [\u001b[31mFAIL\u001b[0m] Search request failed: {str(e)}")
        return False

def test_fundamentals(ticker="AAPL"):
    url = f"http://127.0.0.1:8080/api/stock/fundamentals?ticker={ticker}"
    print(f"[TEST] Querying Fundamentals: {url}")
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            status = response.getcode()
            body = response.read().decode('utf-8')
            res_json = json.loads(body)
            if status != 200 or res_json.get('status') != 'ok':
                print(f"  [\u001b[31mFAIL\u001b[0m] Expected 200 ok for fundamentals, got: {res_json}")
                return False
            print(f"  [\u001b[32mPASS\u001b[0m] Fundamentals loaded for {ticker}. Market Cap: {res_json.get('marketCap')}, Sector: {res_json.get('sector')}")
            return True
    except Exception as e:
        print(f"  [\u001b[31mFAIL\u001b[0m] Fundamentals request failed: {str(e)}")
        return False

def main():
    print("=" * 60)
    print("AETHERTRADE WATCHLIST BACKEND PROXY TESTER")
    print("=" * 60)
    
    # Test 1: Querying a valid pre-seeded or Twelve Data symbol (AAPL)
    pass_1 = test_endpoint("AAPL", 200, is_valid_symbol=True)
    
    # Test 2: Querying a valid non-default Twelve Data symbol (AMD)
    print("-" * 60)
    pass_2 = test_endpoint("AMD", 200, is_valid_symbol=True)
    
    # Test 3: Querying an invalid symbol (ABCDEFG)
    print("-" * 60)
    pass_3 = test_endpoint("ABCDEFG", 500, is_valid_symbol=False)

    # Test 4: Querying Autocomplete Search (apple)
    print("-" * 60)
    pass_4 = test_search("apple", "AAPL")

    # Test 5: Querying Live Fundamentals (AAPL)
    print("-" * 60)
    pass_5 = test_fundamentals("AAPL")
    
    print("=" * 60)
    if pass_1 and pass_2 and pass_3 and pass_4 and pass_5:
        print("SUMMARY: \u001b[32mALL TESTS PASSED SUCCESSFULLY!\u001b[0m")
        sys.exit(0)
    else:
        print("SUMMARY: \u001b[31mSOME TESTS FAILED!\u001b[0m")
        sys.exit(1)

if __name__ == "__main__":
    main()
