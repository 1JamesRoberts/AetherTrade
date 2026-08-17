# AetherTrade - Agent Guidelines and Rules

This document outlines the rules, style guidelines, behavioral constraints, and verification workflows for agents contributing to the **AetherTrade** workspace.

## 🛠️ Technology Stack & Architecture

- **Frontend**: React 19 (Vite), Lightweight Charts (`lightweight-charts`), Chart.js
- **Styling**: Vanilla CSS (Modern CSS variables, glassmorphism, dynamic gradients). **Avoid using TailwindCSS** unless explicitly requested by the user.
- **Database/Auth**: Supabase (PostgreSQL, GoTrue)
- **Local Backend Proxy**: Python 3 (`http.server.ThreadingHTTPServer` + `.venv` with `yfinance`)
- **Serverless Production (Vercel)**: `api/stock.js` (Node.js) & `api/fundamentals.py` (Python) via `vercel.json` and `requirements.txt`

---

## 🎨 Design & UI/UX Principles (Vanilla CSS)

1. **Theme**: Premium glassmorphic dark theme (RGB semi-transparent backgrounds, backdrop-blur, subtle gradients).
2. **Typography**: Modern typography (Google Fonts like Inter and Outfit) rather than browser defaults.
3. **Animations**: Use subtle micro-animations (e.g., transitions on hover, fade-in, slide-in toasts) to enhance the premium feel.
4. **No Placeholders**: Never use placeholder images. If visual assets are needed, generate them using the image generation tool.
5. **Chart Layout Stability**:
   - `.chart-container` must maintain a fixed height (`520px` desktop, `420px` mobile) with `flex-shrink: 0` so expanding/collapsing insights beneath it never squeezes the stock chart canvas.
   - On mobile screens (`< 600px`), hide right Y-axis price scale numbers to maximize candlestick chart width.

---

## ⚙️ Core Behavioral Constraints & Rules

1. **Smart Offline Fallback**:
   - If Supabase configuration (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) is missing, invalid, or fails to connect, the application **must** fall back gracefully to local-only/offline mode.
   - User sessions, watchlist items, and portfolio transactions must be persisted in the browser's `localStorage` in offline mode.
2. **Dual-Runtime Backend Architecture (Local & Vercel)**:
   - **Local Dev**: `server/server.py` uses `ThreadingHTTPServer` and in-memory TTL caching (15s for candles, 5 min for fundamentals) so candlestick chart requests are never blocked by fundamentals scraping.
   - **Vercel Production**: Any changes to `/api/stock` or `/api/stock/fundamentals` must be mirrored across both:
     - `server/server.py` (Local Python server)
     - `api/stock.js` (Vercel Node.js function)
     - `api/fundamentals.py` (Vercel Python function)
     - `vercel.json` (Vercel URL routing)
   - Rotate Twelve Data API keys (`TWELVE_DATA_KEY_1`..`7`) to prevent rate limiting.
   - Fundamentals must be fetched live via `yfinance` without mock data.
3. **Event Propagation**:
   - In lists (e.g., watchlist deletions), prevent event bubbling (e.g., using `e.stopPropagation()`) so that deleting an item does not trigger a selection change or re-charting.
4. **Active Asset Fallback**:
   - If the currently active/charted stock symbol is deleted from the watchlist, the active charted asset must automatically fall back to the first remaining asset in the watchlist.

---

## 🧪 Verification & Testing Workflows

Before declaring any task complete:
1. **Backend Verification**:
   - Verify Python server running on `.venv` (`npm run server` or `python server/server.py`).
   - Run the automated test script to verify endpoint status codes and API key rotation:
     ```bash
     python .agents/skills/tester/scripts/test_backend.py
     ```
2. **Frontend Validation**:
   - Verify local storage persistence (`aethertrade_cached_stocks`, `aethertrade_fundamentals_cache`).
   - Test dynamic search additions, invalid symbols, and toast error messages.
   - Confirm active asset fallbacks and event bubble preventions are functioning.
   - Test chart height stability when toggling accordions and switching timeframes (`1D`, `1W`, `1M`, `1Y`, `5Y`).
3. **Build Integrity**:
   - Always run `npm run build` to ensure production bundle compiles cleanly.
4. **Documentation**:
   - Retain existing code comments, docstrings, and styling definitions unless specifically requested to change them.

