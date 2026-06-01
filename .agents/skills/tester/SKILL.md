---
name: watchlist-tester
description: Tests and validates the AetherTrade Interactive Watchlist System, checking both backend API responses for valid/invalid symbols and local storage frontend states.
---

# Watchlist Tester Skill

This skill provides resources and step-by-step instructions to test and validate the **Interactive Watchlist System** in AetherTrade.

## Overview

The Interactive Watchlist System comprises:
1. **Backend Proxy (`server.py`)**: Rotates API keys and queries the Twelve Data API. It must return a `200` status with historical values for valid symbols and a `500` status with a clean JSON error message (containing `"symbol not found"` or `"not found"`) for invalid symbols.
2. **Frontend Engine (`app.js`)**: Syncs with `localStorage`, dynamically updates the list, supports search-to-add, blocks deletion event bubbling, and executes active asset fallback reassignments.

## Provided Tools & Scripts

### 1. Backend Proxy Validation Script
A python verification script is included at [scripts/test_backend.py](file:///Users/kritteebenjasilarak/Documents/Test-agy/.agents/skills/tester/scripts/test_backend.py). It runs a battery of HTTP requests against the active AetherTrade proxy server to confirm correct response formats and status codes for:
- Valid symbols (e.g. `AAPL`, `MSFT`) -> Must return `200 OK`.
- Invalid symbols (e.g. `XYZ`, `INVALID`) -> Must return `500` with detailed error payload.

### 2. Frontend User-Experience Manual Verification Checklist
Detailed step-by-step manual validation workflows are documented below to check DOM re-renders, LocalStorage persistence, and safety fallbacks.

---

## How to Run Backend Verification

1. Ensure the AetherTrade proxy server is running at `http://localhost:8080` (run `python3 server.py` if not running).
2. Execute the verification script:
   ```bash
   python3 .agents/skills/tester/scripts/test_backend.py
   ```
3. Inspect output. The script will log results for each query and report a summary.

---

## Frontend Manual Verification Guide

### Test Case 1: Initial Watchlist Seeding
1. Open AetherTrade in your web browser (`http://localhost:8080`).
2. Open the browser console (`F12` -> Console).
3. Clear LocalStorage: `localStorage.clear()`.
4. Refresh the page.
5. **Expected Outcome**: The default watchlist (`AAPL`, `MSFT`, `NVDA`, `TSLA`, `GOOG`, `AMZN`) must load successfully with live prices under the title **Watchlist / My Tracked Assets**.

### Test Case 2: Dynamic Search and Custom Symbol Addition
1. Type `AMD` in the sidebar search input.
2. **Expected Outcome**: A dashed custom row `+ Add 'AMD'` appears at the bottom.
3. Click the `+ Add 'AMD'` row.
4. **Expected Outcome**:
   - The search input and clear button reset.
   - The main chart canvas updates with a cyan loader and then charts `AMD`.
   - `AMD` appears in the left panel list under "My Tracked Assets".
   - `AMD` price is fetched in the background.

### Test Case 3: Rejection of Non-Existent Symbols
1. Type `ABCDEFG` (a non-existent symbol) in the search input.
2. Click `+ Add 'ABCDEFG'`.
3. **Expected Outcome**:
   - A beautiful glassmorphic toast notification slides in from the top-right: `"Ticker 'ABCDEFG' does not exist on Twelve Data!"` with a warning triangle icon.
   - `ABCDEFG` is **NOT** added to the watchlist.
   - The system automatically re-focuses and re-charts your previous active stock.

### Test Case 4: Watchlist Deletion & Bubble Prevention
1. Hover over `TSLA` in the watchlist.
2. Click the transparent red trash-can button next to it.
3. **Expected Outcome**:
   - `TSLA` is immediately removed from the left sidebar.
   - The main chart **DOES NOT** switch focus to `TSLA` (event bubbling is successfully blocked).

### Test Case 5: Active Asset Fallback
1. Make sure `AAPL` is active and charted.
2. Hover over `AAPL` in the watchlist.
3. Click the red trash-can button.
4. **Expected Outcome**:
   - `AAPL` is deleted from the sidebar watchlist.
   - The active charted asset automatically changes to the first remaining asset in the watchlist (e.g. `MSFT` or `AMD`).
   - The chart refreshes and loads data for the new active asset without crashing.

### Test Case 6: LocalStorage Persistence
1. Close the browser tab.
2. Open a new tab and go back to `http://localhost:8080`.
3. **Expected Outcome**: Your customized watchlist (with deleted/added items) loads instantly in its exact state.
