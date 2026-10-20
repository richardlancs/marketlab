# MarketLab

A stock dashboard, portfolio simulator and strategy backtester. The live site is at **[marketlab-theta.vercel.app](https://marketlab-theta.vercel.app)**, and it runs on simulated prices.

**Built with:** Next.js 16 · React 19 · Tailwind CSS 4 · Better Auth · Drizzle + Turso (SQLite) · a Python analytics service (FastAPI, pandas, NumPy) · Vercel

## Features

- **Markets:** a dashboard, a stocks table, stock pages and ⌘K search across about 95 US stocks and 3 indices.
- **Simulated trading:** market, limit and stop orders, with dividends and stock splits applied.
- **Your watchlist and portfolio** are saved with or without an account. A guest's data moves into the account on sign-in.
- **Portfolio analytics:**
  - value over time against an index;
  - return, drawdown, volatility and Sharpe ratio;
  - sector breakdown;
  - CSV export.
- **Price alerts,** checked at every close by a daily job.
- **Backtesting:**
  - four built-in strategies (buy and hold, moving-average crossover, dollar-cost averaging, rebalancing), or your own rules;
  - up to five stocks, with trading costs and a benchmark;
  - parameter sweeps;
  - saved runs that can be reproduced exactly;
  - share links.
- **Learn:** 29 short lessons with demos and quizzes, plus ⓘ explanations of terms throughout the app.
- **Leaderboard:** opt-in, under a display name.

## Quick start

```bash
npm install
cp .env.example .env.local      # set BETTER_AUTH_SECRET: openssl rand -base64 32
npm run db:migrate              # creates local.db
npm run dev                     # http://localhost:3000
```

**Optional: the Python backtest engine.** It needs [uv](https://docs.astral.sh/uv/).

```bash
npm run analytics:install
# in .env.local: BACKTEST_ENGINE=python, ANALYTICS_URL=http://127.0.0.1:8000, ANALYTICS_SERVICE_TOKEN=<random>
npm run analytics:dev           # the Python service on :8000, alongside npm run dev
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the development server |
| `npm run check` | Lint, test and build (run before pushing) |
| `npm test` | TypeScript unit tests (Vitest) |
| `npm run test:python` | Python tests |
| `npm run test:parity` | Check that the TypeScript and Python engines give identical results |
| `npm run db:generate` | Write a migration after changing `lib/db/schema.ts` |
| `npm run db:migrate` | Apply migrations to the database in `DATABASE_URL` |
| `npm run analytics:install` | Install the Python service's locked dependencies |
| `npm run analytics:dev` | Start the Python service |

## Project layout

| Path | What's there |
|---|---|
| `app/` | Pages and API routes |
| `components/` | UI |
| `lib/market/` | Market data: the mock market, Tiingo, the stock catalog and caching |
| `lib/backtest/` | The TypeScript backtest engine, strategies, the engine choice, price snapshots |
| `lib/lessons/` | The lessons and their demos |
| `lib/db/` | The database schema (Drizzle), accounts, guests, saved runs |
| `lib/*-actions.ts` | Server Actions: every change goes through these |
| `services/analytics/` | The Python backtest service ([README](services/analytics/README.md)) |
| `drizzle/` | Migrations |
| `docs/` | [How it works](docs/how-it-works.md) · [Deploying](docs/deploying.md) |

## Market data

The mock market is the default and needs no key. Setting `TIINGO_API_KEY` gives real end-of-day prices, but Tiingo's free plan is **for personal use only**, so never set it on a public deployment. See [How it works](docs/how-it-works.md#market-data).

## Backtest engines

`BACKTEST_ENGINE=typescript` (the default) runs backtests in the Next.js server. `BACKTEST_ENGINE=python` sends buy-and-hold and moving-average runs to the Python service. Both engines follow the same timing rule:

1. decide from the previous session's closes;
2. fill the orders at today's close;
3. value the portfolio at today's close.

Both give identical results on fixed datasets. See the [analytics README](services/analytics/README.md) for the rules, a worked example and the no-look-ahead tests.
