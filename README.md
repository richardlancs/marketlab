# MarketLab

A stock dashboard, portfolio simulator and strategy backtester, built with Next.js 16, React 19 and Tailwind CSS 4.

- **Dashboard, stocks table, stock pages and ⌘K search**, all pre-rendered and refreshed about once an hour. Ten featured stocks fill the dashboard; about 85 more well-known US stocks can be searched, opened, watched, traded and backtested. With real prices (Tiingo), any other ticker works too.
- **Watchlist and simulated trading.** Without an account, everything is saved in your browser (guest mode). With an account, it's saved in a database and follows you between devices. On your first sign-in you can import your guest data.
- **Portfolio analytics.** Your portfolio's value over time, rebuilt from your trades, as growth of $100 against the S&P 500, Nasdaq or Dow, with return, drawdown, volatility and Sharpe ratio; a breakdown by sector; and your trades as a CSV file.
- **Backtesting.** Try buy and hold, a moving-average crossover, dollar-cost averaging, rebalancing, or your own rules (RSI, moving averages, crossovers) on up to five stocks over five years of daily prices, with trading costs, compared with a benchmark. See returns month by month, test a range of settings at once (a parameter sweep), save runs and compare up to four.

## Market data

Prices come from one of two sources:

- **The mock market (default).** Generated from fixed seeds: five years of daily prices that keep moving forward one trading day at a time with the real calendar. No account or key needed.
- **Tiingo (real end-of-day prices).** Used when `TIINGO_API_KEY` is set. Get a free key at [tiingo.com](https://www.tiingo.com). The free plan allows 50 requests an hour and 1,000 a day. The dashboard's 13 symbols cost one request each per hourly refresh. Any other stock costs one request an hour while someone looks at it, plus one (cached for a week) to look up a ticker that isn't in the catalog. A request budget (`lib/market/budget.ts`) stops extra tickers before they could crowd out the dashboard.

> **Licensing:** Tiingo's free plan is for **personal use only**: its terms forbid showing the data to anyone else. Use your key on your own machine or a private deployment. A public deployment must leave `TIINGO_API_KEY` unset, so it uses the mock market. As a safety net, on Vercel the key is ignored (with a warning in the logs) unless `MARKET_DATA_PRIVATE=1` is also set.

### Which stocks exist

- **Core:** the 10 stocks and 3 indices in `lib/market/universe.ts`, on the dashboard and in the stocks table. Their pages are built at `npm run build`.
- **Catalog:** about 95 stocks in `lib/market/catalog.ts`, names and sectors typed by hand. Their pages are built on the first visit and then stored. With mock data, these are the whole market: any other `/stocks/…` URL is a 404.
- **Any ticker (Tiingo only):** search shows "Open this ticker" for a symbol that isn't listed; its page says "not found" if Tiingo doesn't know it.

Saved accounts and backtests only check that a symbol is *well-formed* when they're read, so a stock missing from today's data (say, after switching from Tiingo back to mock) never wipes them; it just shows "—". The server checks a stock really exists when you add it. Accounts can hold and watch up to 30 stocks each.

If Tiingo can't be reached (wrong key, request limit, network), the dashboard shows the mock market with a notice and tries again a minute later. Other stocks never fall back to made-up prices: their pages say the prices are unavailable and retry a minute later. `MARKET_DATA_SOURCE=mock` forces the mock market even when a key is set. Tiingo's end-of-day data has no market cap or P/E, so those show "—" with real prices.

## Running it locally

```bash
npm install
cp .env.example .env.local      # then fill in BETTER_AUTH_SECRET (see below)
npm run db:migrate              # creates local.db with all the tables
npm run dev                     # http://localhost:3000
```

In `.env.local`:

- `BETTER_AUTH_SECRET`: a random string that signs session cookies. Generate one with `openssl rand -base64 32`.
- `BETTER_AUTH_URL=http://localhost:3000`
- Leave `DATABASE_URL` empty to use the local `local.db` file.
- Optionally `TIINGO_API_KEY` for real prices (see [Market data](#market-data)).

## Scripts

| Command               | What it does                                                    |
| --------------------- | --------------------------------------------------------------- |
| `npm run dev`         | Development server                                              |
| `npm run build`       | Production build (also type-checks)                             |
| `npm start`           | Serve the production build                                      |
| `npm test`            | Unit tests (Vitest)                                             |
| `npm run lint`        | ESLint                                                          |
| `npm run check`       | Lint, test and build: run before deploying                      |
| `npm run db:generate` | Write a new migration in `drizzle/` after changing `lib/db/schema.ts` |
| `npm run db:migrate`  | Apply migrations to the database in `DATABASE_URL`              |

## Deploying

MarketLab runs on [Vercel](https://vercel.com) with a [Turso](https://turso.tech) database. Turso is hosted SQLite, so the same code and migrations work locally and online. The public site runs on the mock market.

1. **Check the code** locally: `npm run check`.
2. **Create two Turso databases**, `marketlab-prod` and `marketlab-preview`, in the region closest to Vercel's default (`aws-us-east-1`, near Vercel's `iad1`). For each, get its URL (`turso db show --url <name>`) and a token (`turso db tokens create <name>`).
3. **Apply the migrations to both** from your machine:
   ```bash
   DATABASE_URL=libsql://… DATABASE_AUTH_TOKEN=… npm run db:migrate
   ```
   In later phases, apply new migrations *before* deploying code that needs them.
4. **Import the GitHub repo into Vercel** (it detects Next.js). From then on, every push to `main` deploys to production and every other branch gets a preview URL. Keep Deployment Protection on for previews.
5. **Set the environment variables** (Project → Settings → Environment Variables), separately for Production and Preview:

   | Variable | Production | Preview |
   | --- | --- | --- |
   | `BETTER_AUTH_SECRET` | a new value (`openssl rand -base64 32`) | another new value |
   | `BETTER_AUTH_URL` | `https://<your production host>` | the same (used as a fallback) |
   | `BETTER_AUTH_ALLOWED_HOSTS` | `<production host>` | `<production host>,marketlab-*-<your team>.vercel.app` |
   | `DATABASE_URL`, `DATABASE_AUTH_TOKEN` | the prod database | the preview database |
   | `TIINGO_API_KEY` | **not set** | **not set** |
   | `MARKET_DATA_SOURCE` | optionally `mock`, as a second safety | the same |

6. **Deploy, then test the preview** before production:
   - `/`, `/stocks`, `/stocks/AAPL`; `/stocks/KO` (a skeleton on the first visit, instant after); `/stocks/ZZZZ` gives 404; `/stocks/aapl` redirects.
   - The "Mock data" label and the footer's "Simulated prices" note show.
   - As a guest: watch and buy KO, reload, and it's all still there.
   - Sign up and sign in on the preview URL, import the guest data, trade, then open it in another browser.
   - The 6th wrong password within a minute is refused.
   - Backtest KO + AAPL, save it, compare it.
   - Vercel's function logs show no errors, and the preview database has rows (`turso db shell marketlab-preview "select count(*) from user"`).
7. **Production:** merge to `main`, run the same checks against the production URL, and delete the test account. To undo a bad deploy, use Vercel → Deployments → Instant Rollback.

Better Auth refuses to start in production without a real secret, so a missing variable shows up as an error, not as a quietly insecure site.

If you self-host on more than one server instance (not needed on Vercel), also set `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` to the same value on every instance, so Server Actions work whichever instance answers.

## Where things live

- `app/`: pages and API routes (`/api/auth/*` for sign-in, `/api/account` for loading your account, `/api/quotes` for prices of held or watched stocks outside the core, `/api/history` for backtest prices, `/api/backtests` for saved runs).
- `components/`: UI. `components/account/account-provider.tsx` decides whether the account lives in the browser or the database.
- `lib/trading.ts`: the trading rules. The browser (guest mode) and the server (signed in) both use them.
- `lib/account-actions.ts`: Server Actions for signed-in users. They check the session and validate every input.
- `lib/market/`: market data. `provider.ts` is the interface; `mock.ts` and `tiingo.ts` implement it; `mode.ts` picks one; `index.ts` caches the core market for an hour, and every other stock on its own. `catalog.ts` lists the stocks beyond the core, and `symbols.ts` says what a valid ticker looks like.
- `lib/backtest/`: the backtesting engine (`engine.ts`), the strategies, custom rules (`rules.ts`), run settings (`config.ts`), monthly returns (`periods.ts`) and parameter sweeps (`sweep.ts`, run in a Web Worker by `sweep.worker.ts`). Pure functions, run in the browser.
- `lib/portfolio-history.ts`: rebuilds the portfolio's past values by undoing its trades, newest first.

### Saved backtests and versions

A saved run stores its settings as JSON. Settings carry a `version` (now 2: custom rules were added). Older settings are upgraded when they're read, and settings from a newer version are refused rather than misread, so adding a strategy never needs a database migration. Don't change the `VERSION` in `lib/backtest/saved-local.ts` for this: that one covers the browser's list of saved runs, and changing it hides every guest's saved runs.
- `lib/db/`: the database schema (Drizzle), and the code that reads and writes accounts and saved backtests.
- `lib/auth.ts`: Better Auth configuration (email and password sign-in, rate limits).
