# MarketLab

A stock dashboard, portfolio simulator and strategy backtester. The live site is at **[marketlab-theta.vercel.app](https://marketlab-theta.vercel.app)**, and it runs on simulated prices.

**Built with:** Next.js 16 · React 19 · Tailwind CSS 4 · Better Auth · Drizzle + Turso (SQLite) · a Python analytics service (FastAPI, pandas, NumPy, SciPy, statsmodels, scikit-learn) · Vercel

## Features

- **Markets:** a dashboard, a stocks table, stock pages and ⌘K search across about 95 US stocks and 3 indices. The simulated market moves like the real one: shared market and sector moves, realistic betas, and calm and stormy stretches.
- **Simulated trading:** market, limit and stop orders, with dividends and stock splits applied, and an optional reason and note on each trade (a private trading journal).
- **Your watchlist and portfolio** are saved with or without an account. A guest's data moves into the account on sign-in.
- **Portfolio analytics:**
  - value over time against an index;
  - return, drawdown, volatility and Sharpe ratio;
  - sector breakdown;
  - CSV export.
- **Research tools:**
  - risk and technicals on every stock page, with a GARCH volatility forecast (likely ranges for the next day, week and month, and how today compares with the stock's history);
  - a screener with presets;
  - portfolio risk analysis with stress tests, a Monte Carlo projection and optimised weightings;
  - how holdings or watched stocks move together: a clustered correlation map and the number of independent bets;
  - a goal planner: monthly contributions or withdrawals, a target and inflation;
  - factor analysis: what drives a stock or portfolio (market, size, value, momentum, low volatility);
  - an options lab: a simulated chain, the Greeks, implied volatility and strategy payoffs.
- **Alerts** on prices and indicators (RSI, average crosses, big moves, 52-week highs), checked at every close by a daily job.
- **Portfolio history** kept nightly, so past values stay exact.
- **Backtesting:**
  - seven built-in strategies (buy and hold, moving-average crossover, dollar-cost averaging, rebalancing, momentum rotation, risk parity, optimised weights), or your own rules;
  - up to five stocks, with trading costs and a benchmark;
  - parameter sweeps, with overfitting checks and walk-forward testing;
  - "Was it luck?": any run against 1,000 random versions of itself, and a range for its Sharpe ratio;
  - saved runs that can be reproduced exactly;
  - share links;
  - a pairs-trading lab: find cointegrated pairs (adjusted for how many were tested) and trade the gap the year after;
  - a machine-learning sandbox that tests models walk-forward against luck and buy and hold.
- **Learn:** 50 short lessons with demos and quizzes, plus ⓘ explanations of terms throughout the app.
- **Leaderboard:** opt-in, under a display name.

## Quick start

```bash
npm install
cp .env.example .env.local      # set BETTER_AUTH_SECRET: openssl rand -base64 32
npm run db:migrate              # creates local.db
npm run analytics:install       # the Python service's dependencies (needs uv: https://docs.astral.sh/uv/)
npm run dev                     # http://localhost:3000, and the Python service on :8000
```

`npm run dev` starts both and wires them together. Backtests and the analytics cards need the Python service; without uv, only Next.js starts and says what won't work.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the development server and the Python service |
| `npm run dev:web` | Start only the Next.js development server |
| `npm run check` | Lint, test and build (run before pushing) |
| `npm test` | TypeScript unit tests (Vitest) |
| `npm run test:python` | Python tests |
| `npm run db:generate` | Write a migration after changing `lib/db/schema.ts` |
| `npm run db:migrate` | Apply migrations to the database in `DATABASE_URL` |
| `npm run analytics:install` | Install the Python service's locked dependencies |
| `npm run analytics:dev` | Start only the Python service |
| `npm run logos:fetch` | Re-download company logos after changing the catalog |

## Project layout

| Path | What's there |
|---|---|
| `app/` | Pages and API routes |
| `components/` | UI |
| `lib/market/` | Market data: the mock market, Tiingo, the stock catalog and caching |
| `lib/backtest/` | Backtest settings, the Python client, price snapshots, extra measures, and the Learn demos' small engine |
| `lib/analytics/` | Stored analytics: the price store sync, stock profiles, factors, the screener, portfolio analysis and plans |
| `lib/options/`, `lib/ml/`, `lib/pairs/` | The options lab, the machine-learning sandbox and the pairs lab (types and server calls) |
| `lib/lessons/` | The lessons and their demos |
| `lib/db/` | The database schema (Drizzle), accounts, guests, saved runs |
| `lib/*-actions.ts` | Server Actions: every change goes through these |
| `services/analytics/` | The Python analytics service: every calculation ([README](services/analytics/README.md)) |
| `drizzle/` | Migrations |
| `docs/` | [How it works](docs/how-it-works.md) · [Deploying](docs/deploying.md) |

## Market data

The mock market is the default and needs no key. Setting `TIINGO_API_KEY` gives real end-of-day prices, but Tiingo's free plan is **for personal use only**, so never set it on a public deployment. See [How it works](docs/how-it-works.md#market-data).

## The analytics service

Every calculation runs in the Python service: backtests, sweeps and walk-forward tests, historical screens, the luck check, the pairs lab, volatility forecasts, portfolio performance, risk and correlation, the goal planner, stock profiles and factors, the options lab, the machine-learning sandbox, SEC company numbers, and the nightly jobs. The Next.js app keeps accounts, trading, market data and the pages. See [What runs where](docs/how-it-works.md#what-runs-where).

Backtests follow one timing rule:

1. decide from the previous session's closes;
2. fill the orders at today's close;
3. value the portfolio at today's close.

See the [analytics README](services/analytics/README.md) for the rules, a worked example and the no-look-ahead tests.
