# AetherTrade - Agent Guidelines and Rules

This document outlines the rules, style guidelines, behavioral constraints, and verification workflows for agents contributing to the **AetherTrade** workspace.

## 🛠️ Technology Stack & Architecture

- **Frontend**: React 19 (Vite), Chart.js
- **Styling**: Vanilla CSS (Modern CSS variables, glassmorphism, dynamic gradients). **Avoid using TailwindCSS** unless explicitly requested by the user.
- **Database/Auth**: Supabase (PostgreSQL, GoTrue)
- **Backend API Proxy**: Python 3 (`http.server`)

---

## 🎨 Design & UI/UX Principles (Vanilla CSS)

1. **Theme**: Premium glassmorphic dark theme (RGB semi-transparent backgrounds, backdrop-blur, subtle gradients).
2. **Typography**: Ensure modern typography (e.g., Google Fonts like Inter or Outfit) is used rather than browser defaults.
3. **Animations**: Use subtle micro-animations (e.g., transitions on hover, fade-in, slide-in toasts) to enhance the premium feel.
4. **No Placeholders**: Never use placeholder images. If visual assets are needed, generate them using the image generation tool.

---

## ⚙️ Core Behavioral Constraints & Rules

1. **Smart Offline Fallback**:
   - If Supabase configuration (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) is missing, invalid, or fails to connect, the application **must** fall back gracefully to local-only/offline mode.
   - User sessions, watchlist items, and portfolio transactions must be persisted in the browser's `localStorage` in offline mode.
2. **Backend Proxy & Key Rotation**:
   - The Python proxy server (`server/server.py`) rotates through multiple Twelve Data API keys. When modifying or extending endpoints, do not break the key rotation or rate limit handling.
   - Maintain correct API response status codes: `200` for valid symbols, `500` with clean JSON error messages for invalid/non-existent symbols.
3. **Event Propagation**:
   - In lists (e.g., watchlist deletions), prevent event bubbling (e.g., using `e.stopPropagation()`) so that deleting an item does not trigger a selection change or re-charting.
4. **Active Asset Fallback**:
   - If the currently active/charted stock symbol is deleted from the watchlist, the active charted asset must automatically fall back to the first remaining asset in the watchlist.

---

## 🧪 Verification & Testing Workflows

Before declaring any task complete:
1. **Backend Verification**:
   - Ensure the Python server is running (`python server/server.py`).
   - Run the automated test script to verify endpoint status codes and API key rotation:
     ```bash
     python .agents/skills/tester/scripts/test_backend.py
     ```
2. **Frontend Validation**:
   - Verify local storage persistence by clearing storage and refreshing.
   - Test dynamic search additions, invalid symbols, and toast error messages.
   - Confirm active asset fallbacks and event bubble preventions are functioning.
3. **Documentation**:
   - Retain existing code comments, docstrings, and styling definitions unless specifically requested to change them.
