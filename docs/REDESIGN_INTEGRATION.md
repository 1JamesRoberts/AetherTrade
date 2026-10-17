# Integrated AetherTrade redesign

The approved Apple-inspired design now wraps the real application on `codex/redesign-prototype`. The original `/prototype/` remains available as the first-stage sample demo. No push, deployment, production sign-in, database migration, or production database write was performed.

## Review the working interface safely

Run both:

```sh
npm run server
npm run dev:review
```

Open **http://127.0.0.1:5174/**. This is the full application, using its normal local-only account and portfolio hooks. The review config disables `.env` loading and excludes `VITE_*` variables from the client, including inherited cloud credentials. The distinct port gives it separate browser storage from the regular development site. Do not use the same origin for a production-like workspace.

Open a disposable workspace, for example `design-review@example.invalid`, then use **Load fictional sample**. This review-only action imports `docs/fixtures/redesign-review.csv` through the existing CSV parser, validation, and import handler. It does not seed anything automatically. Its eight fictional entries include five US/Thai holdings, purchase and sale fees, two dividends, and a partial sale. Quotes, FX, history, and fundamentals still come from the actual market-data backend. The existing import prompt offers append with OK or replace with Cancel; replace applies only to the review workspace when using this URL.

The normal `npm run dev` and production build retain the existing environment configuration and authentication behavior. In that mode, transactions affect whichever real workspace is signed in, just as before. The sample-loader action is excluded from a normal production build.

## Where the features are

| Workspace | Included functionality |
| --- | --- |
| Portfolio | Portfolio selection, create/rename/delete, USD/THB base currency, net worth and cost, realized/unrealized P&L, dividends, cumulative ROI, historical performance and all existing periods, allocation, complete sortable holdings with costs/prices/weights/dividends, refresh, CSV import/export, reset |
| Portfolio → Rebalancing & target allocations | Existing target weights, equal split, normalization, full/deposit planning, copy plan, prefill transaction, individual recording and batch recording |
| Activity | Original BUY/SELL/DIVIDEND form, per-share or direct-total dividends, fees/withholding, transaction date, account, estimates, symbol search, validation, history, type/search filters, editing and deletion |
| Research | Original watchlist search/add/remove/filter/collapse, line/candle charts, daily/weekly/monthly/yearly/five-year ranges, compatible intervals, volume, EMA/SMA, zoom, fullscreen, S/R annotations, auto levels, strategy/profit projections and cross-portfolio holdings |
| Research → Key Statistics & Fundamentals | Original company information, valuation/earnings/liquidity statistics, 52-week range, company profile, analyst targets/consensus, and technical health/momentum |
| Account | Existing Supabase authentication/sync or local-only persistence, account-scoped records, sign-out, existing notifications and error handling |

Rebalancing is a disclosure to keep the overview readable. All its controls remain inside. The global Record transaction action opens the original form, and a rebalance prefill takes you to that form with the selected order. Portfolio and Research have equal navigation weight; Activity makes the ledger easy to reach.

## Design and implementation

- System typography, tabular figures, restrained teal accents, quiet surfaces, a desktop sidebar, and phone bottom navigation.
- System/Light/Dark appearance, initially following the device. A separate appearance preference does not change any account or portfolio storage keys. Device changes are observed while System is selected; the theme is applied before paint.
- Theme-aware Chart.js canvases, tooltips, and Lightweight Charts. The research chart changes theme in place, preserving its zoom and annotation state.
- Chart.js financial updates render immediately without animated interpolation. Reduced-motion, reduced-transparency, and increased-contrast rules are included. The browser zoom restriction was removed.
- The research plot remains 520px on desktop and 420px on phones. Fullscreen uses the available viewport. The right price scale retains the existing narrow-chart hiding behavior.
- Safari portfolio-axis safeguards remain explicit: `formatPerformanceAxisValue`, ASCII `THB` prefixes and digits, Arial/system font, left alignment, and at least 104px reserved axis width. Canvas labels were visually verified in native Safari in both themes.
- The separate volume histogram no longer displays a dollar-denominated volume value on the stock price axis; its values and bars are unchanged.

The redesign reuses the existing feature components and callbacks. Portfolio arithmetic, ledger rebuilding/validation, CSV parsing, currency/rebalance utilities, authentication, account storage, Supabase services/hooks, Python APIs, and SQL files are unchanged. The original stylesheet is retained; `src/redesign.css` adds the new presentation layer. The old drag divider between the two portfolio panels has been replaced by a responsive overview and editor layout.

## Verification and limits

- 48 JavaScript tests pass, including the existing financial, offline/cloud synchronization, ledger, CSV, account-ownership, and SQL rollback checks. Two integration tests cover device/theme changes, reduced-motion preference handling, preserving existing account data, and opening an audit entry in the original editor with shares, price, and fees intact.
- Five Python production-handler unit tests pass. The required live backend script passes US/Thai symbols, invalid symbols, search, fundamentals, and USD/THB retrieval.
- Lint and the production build pass; the existing large-bundle warning remains. The separate first-stage prototype build is also retained.
- Native Safari review: local-only entry; actual sample BUY and audit entry; sample CSV parser/import/replacement; calculated portfolio/holdings/FX/dividends; persistence through a reload; chart period selection; Light/Dark; ASCII THB canvas labels; research candlesticks, EMA, volume and loaded fundamentals. Safari's responsive mode was reviewed at 390×844 and 320×844 with phone navigation and all portfolio actions available.
- Native Safari later lost its verifiable window target. Automatic approval review blocked further scrolling/screenshots to avoid capturing an unrelated private page. The screenshots/checks completed before that point are valid; additional scrolling, final narrow-screen chart screenshots and further native interactions remain unverified unless the user authorizes resuming them on the local review tab. Safari may remain in Responsive Design Mode; Control-Command-R exits it.
- A physical iPhone, touch gestures, software keyboard, VoiceOver, other browser engines, real cloud writes/OAuth, and OS-level transparency/contrast changes were not exercised. Those financial/persistence behaviors remain covered by the existing isolated tests, rather than production writes.

The local review contains fictional ledger entries and public market data only. Clearing it or recording review transactions does not change saved portfolios on another origin.
