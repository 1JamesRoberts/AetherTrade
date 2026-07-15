# 🌌 AetherTrade - Interactive Stock Terminal

AetherTrade is a premium interactive support & resistance stock terminal with real-time profit projection, custom indicators, database persistence, and transaction log management.

---

## ✨ Features

- **📊 Support & Resistance Terminal**: Chart stock series dynamically and draw support/resistance lines with customizable crosshair line opacity.
- **🔐 Flexible Auth**: Sign up or log in using email/password, or OAuth (Google & GitHub) via Supabase.
- **🔄 Smart Offline Fallback**: If Supabase credentials are not configured, the terminal automatically runs in a local-only/offline mode, storing session and transaction logs locally in your browser's `localStorage`.
- **💼 Portfolio Manager**: Record transactions (Buy/Sell, price, shares, and transaction fees), calculate real-time average cost, and compute realized P&L dynamically.
- **📥 CSV Integration**: Import transaction logs from a CSV file (append or replace options) and export portfolios as structured CSV files.
- **🔑 API Key Rotation**: A Python backend proxy that rotates through multiple Twelve Data API keys to bypass request rate limits on free-tier plans.
- **📱 Responsive Layout**: Glassmorphic dark theme optimized for both desktop and mobile screens, featuring an adaptive stock picker dropdown, collapsible sidebar, and responsive layout.

---

## 🛠️ Technology Stack

- **Frontend**: React 19 (Vite), Chart.js
- **Styling**: Vanilla CSS (Modern CSS variables, glassmorphism, dynamic gradients)
- **Database/Auth**: Supabase (PostgreSQL, GoTrue)
- **Backend API Proxy**: Python 3 (`http.server`)

---

## 🚀 Getting Started

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [Python 3](https://www.python.org/)

### 2. Installation
Clone the repository and install the dependencies:
```bash
npm install
```

### 3. Configuration (`.env`)
Create a `.env` file in the root of your project using `.env.example` as a template:
```env
# Optional: Supabase configuration (omit/leave default to run in local-only mode)
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Required: Twelve Data API key(s) for backend proxy rotation
TWELVE_DATA_KEY_1=your_twelve_data_key_here
TWELVE_DATA_KEY_2=
...
```

---

## 💻 Running the Application

To run the application, you need to start both the Python backend server (the stock data proxy) and the Vite frontend development server.

### Start the Backend Proxy
```bash
python server/server.py
```
This runs the proxy server at `http://127.0.0.1:8080` which fetches price series from Twelve Data API.

### Start the Frontend Dev Server
In a separate terminal window, run:
```bash
npm run dev
```
This launches the React development server at `http://localhost:5173`. Open this URL in your browser to interact with the AetherTrade terminal.

---

## 🧪 Testing the Backend Proxy

The project includes an automated test script to verify that the backend proxy connects successfully and rotates keys correctly:

Ensure the Python server is running on `127.0.0.1:8080`, then execute:
```bash
python .agents/skills/tester/scripts/test_backend.py
```
This script validates:
- Retrieving stock data for valid symbols (`AAPL`, `AMD`)
- Correct `500` error propagation for non-existent/invalid tickers
