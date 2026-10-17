# AetherTrade design preview

This records the first, sample-only design stage. The design is now integrated with the real interface; see [the integration notes](REDESIGN_INTEGRATION.md) for current review instructions and verification. Statements below about the unchanged original interface describe the first stage only.

Branch: `codex/redesign-prototype`, created from local `main` at `dc47853` with a clean working tree. The recent persistence and portable currency-axis fixes are in that ancestry. Remote refs were inspected locally; no push or deployment was performed.

## Review locally

Keep `npm run server` and `npm run dev` running, then open **http://127.0.0.1:5173/prototype/**. The existing application remains at `/`.

The prototype itself needs no backend. Its HTML entry imports only `src/prototype/main.jsx`, its own stylesheet, React, fictional fixtures, and the existing pure axis formatter. It never initializes authentication, Supabase, portfolio hooks, browser storage, or market-data requests. All interactions reset on reload. The normal production build excludes the prototype; `npm run build:prototype` explicitly builds it into ignored `dist-prototype/` for local review.

## Design direction

The installed `apple-design` skill is the primary guide: system typography with size-specific tracking, readable tabular figures, quiet surfaces, restrained translucent navigation, immediate press feedback, and clear navigation. Theme defaults to the device preference and responds to changes; the Appearance selector also offers Light and Dark. Reduced motion removes transforms and transitions, reduced transparency makes chrome solid, and increased contrast strengthens borders and text.

Portfolio and Research have equal navigation weight. Desktop uses a sidebar; phones use bottom navigation. Portfolio includes performance, holdings, allocation, dividends, and a sample rebalancing exploration. Research includes a filterable watchlist, asset selection, illustrative charts, fundamentals, and analysis. Activity includes portfolio-specific sample history and an actual sample CSV download. The transaction dialog supports BUY, SELL, DIVIDEND, native asset currency, fees, date, and fractional quantities.

This is a direction review, not a replacement terminal. Charts use lightweight SVG fixtures, not a new production chart implementation. Overview figures remain illustrative when adding entries. The sample rebalancing panel describes an allocation; it does not calculate orders. CSV import, advanced analysis tools, editable history, cloud/local workspace settings, and full chart controls remain in the existing application for a later integration pass.

## Preserve during integration

| Existing behavior | Existing implementation to retain |
| --- | --- |
| Multiple portfolios, fees, BUY/SELL/DIVIDEND, ledger validation | `usePortfolio`, `portfolioLedger`, `PortfolioManager` |
| USD/THB conversion and return calculations | `currencyUtils`, `portfolioLedger`, `PerformanceHoldings` |
| CSV import/export and atomic replacement | `csvUtils`, portfolio handlers, `portfolioService` |
| Rebalancing and target allocations | `RebalanceStudio`, `rebalanceUtils` |
| Supabase sync, account scoping, local-only persistence | `useAuth`, `useSyncedRecord`, `accountStorage`, portfolio/watchlist hooks |
| Stock analysis, chart overlays, timeframes, watchlist behavior | `ChartContainer`, `AnalysisEngine`, stock/watchlist hooks |

No production components, calculations, storage behavior, endpoints, or database scripts were edited. Prototype styling is loaded only by the separate entry.

The Safari axis safeguard remains in place: explicit ASCII digits and `THB` prefix through `formatPerformanceAxisValue`, system font, left alignment, and reserved width. Preview axes use real HTML text outside the SVG plotting area, avoiding text clipping in a canvas. The existing production canvas fixes remain unchanged.

## Verification

- Existing suite: 46 JavaScript tests and 5 Python unit tests pass.
- Lint, normal production build, and separate prototype build pass. The normal build retains its existing large-bundle warning.
- Required live backend script passes valid/invalid symbols, search, US/Thai fundamentals, and USD/THB requests.
- In-app browser: reviewed desktop at 1280px, phone at 390px, and narrow phone at 320px; Light/Dark and initial System appearance; USD/THB labels; sample dividend and sale entries; native currency selection; Escape dismissal; portfolio-specific history; filtered Thai research and analysis. Research chart height stays 420px on phones when details change.
- Fixed transaction-type buttons submitting the form and hidden table text causing document overflow. At 320px the document width equals the viewport; the holdings table scrolls within its card.
- Separate native Safari access was unavailable because the Mac was locked. Safari itself, real iPhone touch/keyboard behavior, VoiceOver, and OS-level reduced-motion/transparency/contrast changes still need direct verification. Those media rules were inspected in code. No production login or write was used for testing.

Review the spacing, information density, navigation, and transaction flow before integrating this direction with existing functionality.
