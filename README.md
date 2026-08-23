# 🌌 AetherTrade - Interactive Stock Terminal & Portfolio Intelligence Suite

AetherTrade is a state-of-the-art financial terminal featuring interactive TradingView-style candlestick charting, support & resistance crosshairs, fundamental stock intelligence, Wall Street analyst consensus targets, and real-time portfolio management.

---

## ✨ Key Features

### 📊 Advanced Candlestick Charting & Historical Analysis
- **TradingView-Grade Interactive Charts**: High-performance multi-timeframe candlestick series (`1D`, `1W`, `1M`, `1Y`, `5Y`) powered by Lightweight Charts.
- **Support & Resistance Overlays**: Dynamically plot key resistance and support boundaries with live price distance markers.
- **Responsive Mobile Layout**: Right price axis scales dynamically collapse on mobile (`< 600px`) to maximize screen width.

### 🧠 Stock Intelligence & Fundamentals Suite
- **Interactive 52-Week Range Meter**: Live price position indicator with `Near 52W High`, `Near 52W Low`, or `Mid-Range` momentum status badges.
- **8-Card Financial Fundamentals Grid**: Real-time Market Cap, Trailing P/E, Forward P/E, EPS, Dividend Yield, 30-Day Average Volume, 5Y Beta, and Shares Outstanding.
- **Company Profile & Executive Overview**: Sector and industry categorization pills, verified corporate website link, executive business summary, CEO leadership, Headquarters, and Global Workforce count.
- **Wall Street Analyst Targets & Consensus**: Consensus Rating badge (`Strong Buy`, `Buy`, `Hold`, `Sell`), 1Y Average Target Price with Implied Upside/Downside %, visual price target range track, and Buy/Hold/Sell analyst opinion breakdown bar.

### 💼 Portfolio Management & Tracking
- **Transaction Engine**: Record `BUY`, `SELL`, and `DIVIDEND` transactions, execution prices, quantities, and broker/withholding fees with dynamic real-time average cost basis and realized/unrealized P&L calculations.
- **Dividend Income & Total Return (ROI)**: Track cumulative cash dividend payouts received per holding and portfolio-wide, fully integrated into Total Return ROI calculations ($\text{Total Return} = \text{Unrealized P\&L} + \text{Realized P\&L} + \text{Dividend Income}$).
- **Multi-Currency Support**: Real-time FX conversion between USD and THB base currencies for holdings, closed gains, and dividend cash flows.
- **CSV Import & Export**: Seamlessly import existing transaction ledgers (with automatic `DIVIDEND` synonym detection and Fee/Withholding Tax mapping) and export full audit records.
- **Flexible Auth & Smart Offline Fallback**: Authenticate via Supabase (OAuth Google/GitHub or Email) or run completely offline with instant browser `localStorage` persistence.

---

## 🛠️ Technology Stack

- **Frontend**: React 19 (Vite), Lightweight Charts (`lightweight-charts`), Chart.js
- **Styling**: Vanilla CSS (CSS variables, glassmorphism, responsive flex/grid)
- **Database/Auth**: Supabase (PostgreSQL, GoTrue)
- **Local Proxy Server**: Python 3 (`ThreadingHTTPServer` with `yfinance`)
- **Serverless Production**: Vercel Serverless Functions (`api/stock.js` & `api/fundamentals.py`)

---

## 🚀 Quickstart & Local Setup

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [Python 3.10+](https://www.python.org/)

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/1JamesRoberts/VibecodePortfolioTracker.git
cd VibecodePortfolioTracker

# Install Node dependencies
npm install

# Set up Python virtual environment
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

### 3. Environment Configuration (`.env`)
Create a `.env` file in the project root:
```env
# Optional: Supabase configuration (omit to run in local-only offline mode)
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Required: Twelve Data API key(s) for key rotation
TWELVE_DATA_KEY_1=your_twelve_data_key_1
TWELVE_DATA_KEY_2=your_twelve_data_key_2
```

### 4. Running Locally

Start the backend proxy and Vite dev server:
```bash
# Terminal 1: Start Backend Proxy (runs on .venv at http://127.0.0.1:8080)
npm run server

# Terminal 2: Start Frontend Dev Server (runs at http://localhost:5173)
npm run dev
```

---

## ☁️ Vercel Deployment

AetherTrade is configured out of the box for **1-click Vercel Deployment**:

1. **Deploy to Vercel**: Push to your GitHub repository or connect via the Vercel Dashboard.
2. **Environment Variables**: Add your `TWELVE_DATA_KEY_1`...`7` in **Vercel Settings > Environment Variables**.
3. **Serverless Architecture**:
   - `/api/stock` is handled by `api/stock.js` (Node.js Twelve Data proxy).
   - `/api/stock/fundamentals` is handled by `api/fundamentals.py` (Python `yfinance` function).
   - `vercel.json` automatically manages routing and single-page application fallbacks.

---

## 🧪 Testing

Run the automated backend testing suite to verify Twelve Data key rotation and yfinance endpoints:
```bash
python .agents/skills/tester/scripts/test_backend.py
```

