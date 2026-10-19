# MarketLab

A stock dashboard, portfolio simulator and strategy backtester, built with Next.js 16, React 19 and Tailwind CSS 4.

- **Dashboard, stocks table, stock pages and ⌘K search**, all pre-rendered and refreshed about once an hour.
- **Watchlist and simulated trading.** Without an account, everything is saved in your browser (guest mode). With an account, it's saved in a database and follows you between devices. On your first sign-in you can import your guest data.
- **Backtesting.** Try buy and hold, a moving-average crossover, dollar-cost averaging or rebalancing on up to five stocks over five years of daily prices, with trading costs, compared with a benchmark. Save runs and compare up to four.

## Market data

Prices come from one of two sources:

- **The mock market (default).** Generated from fixed seeds: five years of daily prices that keep moving forward one trading day at a time with the real calendar. No account or key needed.
- **Tiingo (real end-of-day prices).** Used when `TIINGO_API_KEY` is set. Get a free key at [tiingo.com](https://www.tiingo.com). The free plan allows 50 requests an hour and 1,000 a day; MarketLab makes one request per symbol (13) per refresh, at most hourly.

> **Licensing:** Tiingo's free plan is for **personal use only**: its terms forbid showing the data to anyone else. Use your key on your own machine or a private deployment. A public deployment must leave `TIINGO_API_KEY` unset, so it uses the mock market.

If Tiingo can't be reached (wrong key, request limit, network), the app shows the mock market with a notice and tries again a minute later. `MARKET_DATA_SOURCE=mock` forces the mock market even when a key is set. Tiingo's end-of-day data has no market cap or P/E, so those show "—" with real prices.

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
| `npm run db:generate` | Write a new migration in `drizzle/` after changing `lib/db/schema.ts` |
| `npm run db:migrate`  | Apply migrations to the database in `DATABASE_URL`              |

## Deploying

The app needs a database the server can reach. Locally that's a SQLite file. Online, use [Turso](https://turso.tech), a hosted database that speaks the same SQLite dialect, so the same code and migrations work on both.

1. **Create a Turso database** and get its URL (`libsql://…`) and an auth token.
2. **Apply the migrations to it** from your machine:
   ```bash
   DATABASE_URL=libsql://… DATABASE_AUTH_TOKEN=… npm run db:migrate
   ```
   Do this again whenever a new migration is added.
3. **Set these environment variables on your host** (on Vercel: Project → Settings → Environment Variables):
   - `BETTER_AUTH_SECRET`: a **new** random value, not your local one.
   - `BETTER_AUTH_URL`: the site's public URL, e.g. `https://marketlab.example.com`.
   - `DATABASE_URL` and `DATABASE_AUTH_TOKEN`: from step 1.
   - **Not** `TIINGO_API_KEY` on a public site (see [Market data](#market-data)).
4. **Deploy.** Better Auth refuses to start in production without a real secret, so a missing variable shows up as an error, not as a quietly insecure site.

If you self-host on more than one server instance (not needed on Vercel), also set `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` to the same value on every instance, so Server Actions work whichever instance answers.

## Where things live

- `app/`: pages and API routes (`/api/auth/*` for sign-in, `/api/account` for loading your account, `/api/history` for backtest prices, `/api/backtests` for saved runs).
- `components/`: UI. `components/account/account-provider.tsx` decides whether the account lives in the browser or the database.
- `lib/trading.ts`: the trading rules. The browser (guest mode) and the server (signed in) both use them.
- `lib/account-actions.ts`: Server Actions for signed-in users. They check the session and validate every input.
- `lib/market/`: market data. `provider.ts` is the interface; `mock.ts` and `tiingo.ts` implement it; `index.ts` picks one and caches the result for an hour.
- `lib/backtest/`: the backtesting engine (`engine.ts`), the strategies, and run settings (`config.ts`). Pure functions, run in the browser.
- `lib/db/`: the database schema (Drizzle), and the code that reads and writes accounts and saved backtests.
- `lib/auth.ts`: Better Auth configuration (email and password sign-in, rate limits).
