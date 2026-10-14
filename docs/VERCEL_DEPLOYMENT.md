# Deploying the review fixes on Vercel

The portfolio and chart fixes have been merged into `main`. Deploy a preview and verify the database setup before promoting to production.

## If you use Supabase

1. Export your portfolios to CSV as a backup.
2. In your Supabase project's SQL Editor, run `supabase/migrations/20261014_safe_portfolio_sync.sql` **before deploying this frontend**. Existing transaction rows remain in place. The migration is safe to rerun and installs:
   - A stable order for transactions entered on the same date.
   - Atomic CSV replacement and first-login initialization functions.
   - Ledger validation for inserts, edits, and deletions, including requests from other browser tabs.
3. Keep `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set in the intended Vercel environment (Preview and/or Production). Use the public anon/publishable key, never a service-role key.
4. Check your Supabase Auth site URL and redirect allowlist for the Vercel URL you actually use. Preview OAuth needs its preview URL allowed separately.
5. Test recording, editing, and deleting a transaction, plus a CSV replacement, in a disposable test portfolio on the preview. A failed save keeps the current ledger and reports an error.

Fresh Supabase projects can run the complete `supabase/schema.sql`, which includes the same migration.

Account caches are now separate. Old browser data is assigned once to the first matching signed-in account; recognizable data belonging to another account is not imported. Legacy storage is retained as a recovery source. Old invalid cloud ledgers remain visible with a correction message; repair the audit history or import a valid replacement CSV.

## If you use local-only mode

Leave the Supabase environment variables empty. The sign-in page clearly labels this as a local workspace: email chooses a browser-local cache and does not authenticate an account. Portfolios, watchlists, and chart annotations survive reloads. Data does not sync to other devices, and clearing browser storage removes it; use CSV exports for backups.

## Vercel settings

- Framework: Vite. Build command: `npm run build`. Output directory: `dist`.
- Node.js: 24.x (also used for verification). Use the same Node runtime for local checks and Vercel builds.
- Stock, search, and fundamentals routes use the Python handlers in `api/`. `vercel.json` retains those routes and gives each Python function a 60-second limit. It excludes frontend source, tests, agent files, and database scripts from their bundles.
- Set `TWELVE_DATA_KEY_1` through `TWELVE_DATA_KEY_7` if you use Twelve Data. Yahoo fallback also works without those keys. Backend API keys must not use a `VITE_` prefix.
- Successful production stock responses are cached at the CDN for 15 seconds. Yahoo weekly intervals and FX/crypto symbols are translated correctly. Incomplete candles with non-finite prices are discarded.
- Python dependencies are installed from `requirements.txt` by Vercel. No always-running Python server is needed in production.

The Python runtime and function-duration configuration follow [Vercel's Python runtime documentation](https://vercel.com/docs/functions/runtimes/python) and [function duration documentation](https://vercel.com/docs/functions/configuring-functions/duration).

## Return calculation

Total ROI is cumulative net gains plus dividends divided by all purchase costs, including purchase fees and closed positions. It remains meaningful after all holdings are sold. USD/THB totals use the current FX rate. This simple metric is not annualized and does not adjust for the timing of deposits, withdrawals, or historical currency movements.

## Checks

```sh
npm ci
npm test
npm run lint
npm run build
.venv/bin/python test/test_stock_api.py
```

The JavaScript suite includes React synchronization regressions and isolated PostgreSQL migration/ownership/rollback tests. The Python unit suite verifies production fallback behavior without network requests. The original live backend suite can still be run against `npm run server`:

```sh
.venv/bin/python .agents/skills/tester/scripts/test_backend.py
```

The build still reports a large-bundle warning. No deployment, production database change, OAuth sign-in, or production write was performed as part of these fixes.
