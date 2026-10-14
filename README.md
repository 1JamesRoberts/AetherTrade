# AetherTrade - Stock Terminal & Portfolio Tracker

AetherTrade is a stock terminal and personal portfolio tracker for US and Thai assets, built with React, Vite, and Python market-data endpoints. It supports browser-local storage or Supabase authentication and synchronization, and can be deployed on Vercel.

## Features

- Interactive line and candlestick charts across daily, weekly, monthly, yearly, and five-year ranges, with support/resistance overlays and optional volume and moving averages.
- Company profiles, financial fundamentals, 52-week ranges, and analyst targets fetched through `yfinance`.
- Multiple portfolios with `BUY`, `SELL`, and `DIVIDEND` transactions, purchase/sale fees, average cost, realized/unrealized profit, and dividend income.
- USD and THB portfolio currencies with FX conversion and performance charts. Axis labels use an explicit `THB` prefix for compatibility with Safari.
- CSV import/export, chronological ledger validation, and atomic cloud CSV replacement. Invalid sales and edits that invalidate later sales are rejected.
- Target allocations and proposed full/deposit rebalancing orders. Recording an order updates the ledger; it does not place a trade with a broker.
- Supabase email, Google, and GitHub authentication, with separate browser caches for each account. Failed cloud saves report an error and preserve the current ledger.
- Local-only workspaces when Supabase is unconfigured. Email selects a workspace on the device; this mode does not authenticate an account or synchronize across devices.

## Technology Stack

- **Frontend:** React 19, Vite 8, Lightweight Charts, Chart.js.
- **Styling:** Vanilla CSS.
- **Database/authentication:** Supabase PostgreSQL and Auth, with row-level security.
- **Local backend:** Python `ThreadingHTTPServer`, Twelve Data, and `yfinance` fallback.
- **Production backend:** Vercel Python functions in `api/`, routed through `vercel.json`.

## Local Setup

### Prerequisites

- Node.js 24.x, used for verification.
- Python 3.10 or newer.

### Installation

```sh
git clone https://github.com/1JamesRoberts/Aether-Trade.git
cd Aether-Trade
npm ci

python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

These commands use macOS/Linux virtual-environment paths.

### Environment Configuration

Create `.env` in the project root. Uncomment and fill in the settings you use:

```env
# Optional: Supabase authentication and cloud synchronization
# VITE_SUPABASE_URL=https://your-project.supabase.co
# VITE_SUPABASE_ANON_KEY=your_public_anon_or_publishable_key

# Optional: Twelve Data keys; Yahoo fallback works without them
# TWELVE_DATA_KEY_1=your_twelve_data_key
# TWELVE_DATA_KEY_2=your_second_key
```

Up to seven Twelve Data keys are supported (`TWELVE_DATA_KEY_1` through `TWELVE_DATA_KEY_7`). Keep backend keys out of `VITE_` variables, which are exposed to the browser. Never use a Supabase service-role key in the frontend.

For a fresh Supabase project, run [supabase/schema.sql](supabase/schema.sql) in its SQL Editor. For an existing installation, run [the safe portfolio sync migration](supabase/migrations/20261014_safe_portfolio_sync.sql) before using the updated frontend. The migration preserves existing transactions and adds stable entry ordering, atomic replacement/setup functions, and ledger validation.

### Start Both Servers

**Local stock synchronization requires both processes to keep running.** `npm run dev` starts only the frontend.

In terminal 1:

```sh
npm run server
```

The Python backend listens on `http://127.0.0.1:8080` and uses `.venv` when available.

In terminal 2:

```sh
npm run dev
```

Open the URL Vite prints, normally `http://localhost:5173`. Vite forwards `/api` requests to the Python backend. If prices fail to sync, check that the backend is running, Python dependencies are installed, and the market-data providers are reachable.

Local-only storage does not remove the need for the backend or internet access to fetch fresh market data. Clearing browser storage removes local portfolios; export CSV backups for records you want to retain.

## Vercel Deployment

1. Connect the GitHub repository to Vercel. Use **Vite**, build command `npm run build`, output directory `dist`, and Node.js **24.x**.
2. If using Supabase, apply the database schema/migration above before deploying. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the intended Vercel environment, and configure Supabase Auth URLs for the deployment.
3. Optionally set `TWELVE_DATA_KEY_1` through `TWELVE_DATA_KEY_7` as backend environment variables.
4. Deploy and check stock loading, portfolio changes, and CSV import/export. A local merge or commit does not update Vercel until that commit is pushed and deployed.

The production routes are:

| Route | Handler |
| --- | --- |
| `/api/stock` | `api/stock.py` |
| `/api/stock/search` | `api/stock-search.py` |
| `/api/stock/fundamentals` | `api/fundamentals.py` |

Vercel installs Python dependencies from `requirements.txt` and runs the handlers on demand. You do not need an always-running Python server in production. The project configures a 60-second function limit and brief CDN caching for stock responses.

See [the deployment guide](docs/VERCEL_DEPLOYMENT.md) for database migration, account-cache recovery, and preview configuration details.

## Portfolio Return Calculation

Total gain is unrealized profit/loss plus realized profit/loss plus net dividend income. Total ROI divides that gain by the cost of **all purchases**, including purchase fees and closed positions, so selling the final holding does not reset ROI to zero.

USD/THB totals use the current FX rate. This is a simple cumulative return metric, not an annualized or cash-flow-adjusted return. It does not measure historical FX gains separately.

## Verification

```sh
npm test
npm run lint
npm run build
.venv/bin/python test/test_stock_api.py
```

The JavaScript suite covers currency/rebalancing calculations, ledger validation, CSV dates, account storage, React synchronization, chart formatting, and isolated PostgreSQL migration/rollback/ownership checks. Python unit tests verify the production stock fallback without network access.

For live backend checks, keep `npm run server` running and use another terminal:

```sh
.venv/bin/python .agents/skills/tester/scripts/test_backend.py
```

Live checks require access to the market-data providers. The production build currently passes with a large JavaScript bundle warning.
