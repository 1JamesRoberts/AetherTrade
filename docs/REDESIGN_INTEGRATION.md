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
| Portfolio → Rebalance | Existing target weights, equal split, normalization, full/deposit planning, copy plan, prefill transaction, individual recording and batch recording |
| Activity | Original BUY/SELL/DIVIDEND form, per-share or direct-total dividends, fees/withholding, transaction date, account, estimates, symbol search, validation, history, type/search filters, editing and deletion |
| Research | Original watchlist search/add/remove/filter/collapse, line/candle charts, daily/weekly/monthly/yearly/five-year ranges, compatible intervals, volume, EMA/SMA, zoom, fullscreen, S/R annotations, auto levels, strategy/profit projections and cross-portfolio holdings |
| Research → Company | Original company information, valuation/earnings/liquidity statistics, 52-week range, company profile, analyst targets/consensus, and technical health/momentum |
| Account | Existing Supabase authentication/sync or local-only persistence, account-scoped records, sign-out, existing notifications and error handling |

Holdings and Rebalance are separate selectable sections. Both retain their controls and local state while switching. Transaction entry appears only in Activity, keeping the portfolio overview focused. Research has Price chart, Company and Analysis sections beside the desktop watchlist. Holdings use searchable, sortable position disclosures on desktop and mobile; all original costs, prices, shares, return, weight/target drift, dividend income, and sale actions remain available in each expanded position. The global Record transaction action opens the original form, and a rebalance prefill takes you to that form with the selected order. Portfolio and Research have equal navigation weight; Activity makes the ledger easy to reach.

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


## Second design pass

The light-table fix and original integration were committed locally as `4d8b751` before this pass. The refinement replaces the five-card summary with a larger value/return hierarchy and a quiet three-item breakdown, separates chart and allocation into rounded surfaces, removes promotional page titles, and separates overview, rebalancing, and transaction tasks. Desktop holdings now use keyboard-operable sorting buttons with `aria-sort`; mobile uses a labeled sort control and complete holding cards. Currency context explicitly distinguishes base-currency value/P&L from native-currency prices/costs. Reduced motion disables press scaling, and reduced transparency/greater contrast have solid navigation fallbacks.

Second-pass verification: ESLint, 50 JavaScript tests, production build, and whitespace checks passed. The two additional tests cover account selection and ledger errors without mounting the editor, and switching between holdings and rebalancing without modifying the ledger. The existing ASCII axis regression test passes; the chart's `THB 20K` formatter, system/Arial font, left-aligned labels and reserved 104-pixel gutter were preserved. The existing bundle-size warning remains. Local backend checks also passed for US/Thai prices, FX, search, invalid symbols, and fundamentals; the review server returned HTTP 200.

**Visual testing limit for this pass:** the browser connector reports no available browser sessions. Native Safari scrolling/screenshots were previously blocked by automatic approval review because the target window could not be verified, risking capture of an unrelated private page. That route was not retried. The new desktop/mobile and light/dark CSS was inspected, but this second composition has not been visually verified in a browser or on a physical phone. Earlier screenshots and Safari results above describe the previous checkpoint, not this refinement.

## Component design pass

The new `src/components/ui/Controls.jsx` and `components.css` establish shared inset segmented controls, asset initials, component headings and semantic metric grids. This pass updates the internal markup and controls of TradeOrderForm, TransactionLedger, RebalanceStudio, Watchlist, ChartContainer, StockInsights, PortfolioHeader, AllocationDonut, PerformanceHoldings and AnalysisEngine.

- Transaction entry uses grouped execution fields and a receipt showing gross value, fees, currency, account and net settlement. Buy/Sell/Dividend share one selector, and saving exposes a pending state. Autocomplete results are native buttons.
- Audit history uses native expandable records with net amounts in the summary and quantities, execution price, gross, fees and account inside. Filters and original edit/delete identity handling remain connected.
- Rebalancing has numbered target/order steps, explicit current-versus-target rows, labeled target inputs, full/add-cash selection, cash presets and simpler proposed-order actions.
- Research gets native watchlist selection buttons with sibling removal actions, labeled chart style/range selectors, indicator checkboxes, an interval selector, and semantic fundamentals values. Existing chart heights, interval constraints, zoom, volume, annotations, market-data calls and calculations remain intact.
- Portfolio controls use a compact currency selector and native account-action disclosure. Holdings share the asset identity treatment; allocation rows include proportional color bars alongside their existing figures.

Nine integration tests now exercise theme/device handling, stable edit identity, portfolio navigation, direct/per-share dividend editing, purchase/sale inputs and settlement estimates, filtered audit indices, isolated watchlist removal, and deposit-plan prefills. Together with the existing suite there are 55 JavaScript tests. No calculation, persistence hook, backend, or production database code is changed by this pass.

The component pass has not been visually verified: the browser connector still returns no available sessions, and the previously rejected native Safari path was not retried. Desktop/mobile and both-theme CSS were inspected; browser layout, focus appearance and touch feel still need visual review at http://127.0.0.1:5174/ using disposable sample data.


## Dedicated Research page redesign

Research now uses `src/components/research/ResearchWorkspace.jsx` and `research.css`, with a persistent desktop watchlist, company identity and quote header, and three explicit sections: Price chart, Company, and Analysis. The mobile Watchlist control opens the collection below the section navigation; choosing a symbol returns to the chart. The quote header uses the asset’s native currency, marks unavailable prices with an em dash, and does not invent a percentage when change data is absent.

The chart toolbar prioritizes range and line/candlestick selection. Chart settings disclose indicators, interval, support/resistance overlay and zoom; Escape closes the settings and returns focus to its trigger. Range low/high and current position remain visible under the plot. The plot’s fixed desktop/mobile heights and fullscreen sizing remain unchanged. The Company section presents fundamentals, company profile, analyst targets/consensus and technical health as a readable document. Analysis retains holdings, auto/manual levels, scenario capital and the complete projections matrix, with clearer grouping.

Chart and analysis slots stay mounted while switching sections; the original creation, data, indicator, annotation and resize effects remain responsible for the chart. Company selection is added to the existing UI navigation preference; financial persistence and account data are untouched.

Verification: lint, all 57 JavaScript tests, production build, whitespace checks and the local backend tester passed. The two new Research tests check mounted section state, selected-company context, missing quotes, refresh pending state and watchlist navigation. The existing large-bundle warning remains. The browser connector still lists no available sessions, so this new Research composition has not been visually verified on desktop/mobile or in either theme. Prior Safari screenshots describe earlier passes only.


## Portfolio component redesign — October 19

The portfolio now has a purpose-built account selector and reporting-currency group, a large balance/return hierarchy, and a grouped three-part income strip. The return methodology is available through a native disclosure. CSV import/export and the existing confirmed reset action live in a compact Manage data menu.

Performance uses the shared segmented controls for its measure and date range, with contextual captions, a dedicated refresh control, and a quieter empty state. Allocation keeps the original Chart.js data and tooltip calculations, with a holding count in the center and readable color-keyed share/value/weight rows. Allocation colors repeat consistently for portfolios with more than ten assets.

`HoldingsList.jsx` replaces the nine-column table with position summaries: asset/shares, base-currency market value, gain/percentage, and current/target allocation. Native expandable details retain average cost, current price, total cost including fees, dividend income, drift, and the existing Sell All callback. Search is local to the presentation; the existing sort options and callbacks remain connected. Mobile summaries show their own field labels. `portfolio.css` styles the new components using appearance tokens, system typography, touch targets, visible focus states, and reduced-motion rules. Account and financial persistence and portfolio/chart calculations are unchanged.

Verification for this pass: lint without warnings, all 58 JavaScript tests, the production build, whitespace checks, and the live backend tester passed. The added integration test checks filtered position identity, THB cost/dividend details, sort callbacks, the original sale arguments, and unchanged input data. The build retains its existing large-bundle warning.

Chrome visual review used only `http://127.0.0.1:5174/` and a disposable `portfolio-design-review@example.test` workspace loaded with the fictional CSV. Reviewed wide desktop (1440px), mobile (390px), and narrow mobile (320px), Light/Dark, holding disclosures and search, chart-period selection, USD/THB switching, and rebalance presentation. No horizontal overflow was found in the portfolio components at 320px or in rebalance at 390px. ASCII chart labels including `THB 500K` and digits remained visible. A mobile allocation alignment inherited from the original stylesheet was found during visual review and corrected. These are Chrome responsive viewport checks, not physical-device or Safari tests. The Safari-specific formatter, system/Arial font, left alignment and reserved axis space remain unchanged; native Safari was not retried in this pass. Reduced-motion preference handling remains covered by the existing test and stylesheet. No broker actions, production database writes, push, or deployment were performed.

## Rebalance spacing refinement

The rebalance workflow now uses full-width sequential target and order sections, rather than compressing them into two desktop columns. Each desktop section has its own 1.5rem inset. Target rows and proposed orders have 1.25rem internal padding; mobile retains a 1.25rem outer inset and 1rem row insets, with wrapped controls and vertically grouped order actions. The target total appears in a dedicated progress summary, asset value and share/price context are separated, and proposed buy/sell or allocated/remaining cash totals use labeled figures. Clear weights now has a visible label. Rebalance calculations, persistence, and all existing callbacks and confirmations are unchanged.

Lint, all 58 JavaScript tests, production build and whitespace checks pass; the pre-existing bundle-size warning remains. Browser review could not start: automatic approval review could not complete because its selected model was at capacity. This was a review-service failure, not an unsafe-action determination; no browser action executed and no alternate route was used. Desktop/mobile and theme styling were inspected in code, but this spacing refinement has not been visually verified or captured in a new screenshot.

## Chart level controls

The S&R checkbox has been replaced by an always-discoverable Levels toolbar. Off hides annotations without deleting them; Key shows the closest saved support at/below the quote and closest resistance above it, plus a selected saved price; All shows every saved price with a price-axis label for each level. The lines use theme-aware colors, thin dashed strokes, compact S/R labels, and a thicker selected stroke. A new workspace defaults to Key. The existing saved visibility flag is honored, so a workspace previously set to Off stays Off. Key/All detail selection is transient UI state.

Add level explicitly enters a one-placement tool; viewing or navigating a chart cannot add annotations. Success exits drawing mode, Cancel/Escape restores focus to the tool, and changing the symbol resets drawing/selection. The previous two-decimal rounding and nearby-level duplicate threshold are retained. Manage levels uses a native modal dialog (a bottom sheet at mobile widths), with current price, support/resistance text, currency, percentage distance, selection/removal, and an exact-price input for keyboard users. Native dialog semantics provide focus containment and Escape dismissal; closing restores focus to Manage levels. The manager and Analysis share the same original numeric arrays and synchronization callback. No annotation storage migration or portfolio calculation/persistence change is involved.

The level visibility policy is separate from chart data. Its memoized result avoids recreating price lines on crosshair movement. Level rendering is reapplied after chart reconstruction for a ticker, range, series style, or indicator change. The new toolbar is outside the fixed-height research plot. No chart heights, time range data, technical calculations, or portfolio-axis Safari safeguards are changed.

Verification: lint, all 62 JavaScript tests, production build, and whitespace checks pass; the existing bundle-size warning remains. Four added tests cover key/all/off selection and malformed/missing price inputs; viewing versus one-shot drawing, Escape/focus, symbol changes, other-symbol preservation; and exact THB entry, duplicate feedback, selected-level removal and manager close/focus. Dialog opening/closing is shimmed in JSDOM, so these tests do not establish real-browser focus trapping or layout correctness. The live backend tester also passed. Browser review is blocked because automatic approval review could not complete (the selected review model was at capacity); no browser action executed, no alternate route was used, and there is no new screenshot. Desktop/mobile, both themes, native modal behavior, touch placement and Safari still need visual verification for this change. No push, deployment, or production database writes were performed.

## Compact watchlist hover layering

The sticky Research watchlist now has an explicit stacking level above the ordinary chart panel and below the top navigation. The non-fullscreen chart panel isolates its canvas, loading, and hover layers so their internal z-index values cannot cover compact-watchlist previews or quick-search popovers. Fullscreen is excluded from that isolation. The rail preview/search surfaces now use the active theme's panel, text, border, and shadow tokens. No watchlist data, selection, or chart behavior changed. Lint, build and whitespace checks pass (with the existing bundle-size warning); no new visual browser verification was available. Live backend checks were blocked by local network permissions (`Operation not permitted`).

## Review Sell All before recording

The holdings Sell All action now calls the existing transaction-prefill navigation instead of the transaction-save handler. It opens Activity → Record Trade with SELL, the asset, all held shares, the current price estimate, and the portfolio account. The user can change the execution price, fees, date and quantity before explicitly choosing Record Sell Order. Opening the draft does not write a transaction. Prefilled quantities retain their full numeric precision, and incoming stock quotes do not overwrite a prefilled draft's execution price while the user reviews it. Existing ledger validation and save behavior are unchanged.

Lint, all 63 JavaScript tests, build and whitespace checks pass. The new test covers a position with nine fractional digits, an editable execution price and fee, preservation of the draft price after a quote update, no save before explicit submission, exact submitted quantity and unchanged input portfolio. The build retains its existing bundle-size warning. Browser verification remains unavailable; live backend checks were blocked by local network permissions (`Operation not permitted`).

## Draft stabilization and local merge readiness — October 21

Transaction prefills now carry the source portfolio ID. PortfolioManager only supplies a draft to a new transaction in that portfolio; switching portfolios, opening audit history/editing, or leaving the workspace clears the pending prefill. Successful recording also clears it, while failed saves keep the draft for correction. TradeOrderForm independently refuses a prefill while editing an existing entry or when its explicit portfolio ID does not match. Neither ledger calculations nor financial persistence was changed.

All 66 JavaScript tests, lint, the production build, and whitespace checks passed. Three added regressions cover clearing a draft on a user-driven portfolio switch (including switching back), preventing a stale draft from replacing an audit entry's ticker/type/quantity/price/fees/account/time, and ignoring drafts during programmatic portfolio changes. The live backend tester passed after allowing access to the existing local market-data server. The existing large-bundle warning remains.

The isolated local Chrome review confirmed that Sell All opened Activity with SELL, AAPL, all 90 fictional shares and the current price estimate, with the audit count still at eight before submission. Browser screenshots and subsequent prompt handling became unreliable and a native browser call stalled. Further UI automation was stopped. The final changes therefore do not have a completed fresh desktop/mobile, both-theme or native Safari visual pass; earlier successful visual results elsewhere in this document apply only to their dated versions. This limitation is retained for the local merge. No remote push, deployment, production sign-in or production database write was performed.
