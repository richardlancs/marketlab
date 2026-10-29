# MarketLab

A stock dashboard, paper-trading simulator and strategy backtester, running on simulated prices.

Live: **[marketlab-theta.vercel.app](https://marketlab-theta.vercel.app)**

Next.js 16 · React 19 · Tailwind 4 · Better Auth · Drizzle + Turso · Python (FastAPI) · Vercel

## Features

- Markets: dashboard, stock pages and search across ~95 US stocks
- Paper trading with market, limit and stop orders, and a private trade journal
- Portfolio analytics, risk, forecasts and a review of your own trades
- Backtesting with luck and overfitting checks
- Screener, options lab, pairs lab and an ML sandbox
- Price and indicator alerts, by email or push
- 51 short lessons, monthly competitions and a leaderboard

## Quick start

```bash
npm install
cp .env.example .env.local      # set BETTER_AUTH_SECRET
npm run db:migrate
npm run analytics:install       # needs uv
npm run dev                     # http://localhost:3000
```

## Scripts

| Command | |
|---|---|
| `npm run dev` | Next.js and the Python service |
| `npm run check` | Lint, test and build |
| `npm test` | TypeScript tests |
| `npm run test:python` | Python tests |
| `npm run db:generate` | Write a migration |
| `npm run db:migrate` | Apply migrations |

## Layout

| Path | |
|---|---|
| `app/` | Pages and API routes |
| `components/` | UI |
| `lib/` | Market data, trading, database and server actions |
| `services/analytics/` | Python service: every calculation |
| `drizzle/` | Migrations |

## Docs

- [How it works](docs/how-it-works.md)
- [Deploying](docs/deploying.md)
- [Analytics service](services/analytics/README.md)
