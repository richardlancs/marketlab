# How it works

## What runs where

- **Next.js:** pages, accounts, trading, orders, alerts, email, push, market data.
- **Python** (`services/analytics`): every calculation. Private, called only by Next.js with a shared token.
- **Turso:** one SQLite database, used by both.

## Market data

- **Mock market** (default): seeded, simulated prices that start from real Oct 2026 levels.
- **Tiingo:** real end-of-day prices when `TIINGO_API_KEY` is set. Personal use only; never on a public deployment.

## Trading

- Prices are end-of-day, so limit and stop orders fill at the close.
- Dividends and splits apply on the ex-date.
- `lib/processing.ts` catches an account up with the market. It's safe to run twice.
- Trades can carry a private reason and note.

## Accounts

- Guests are saved by a cookie, and their data moves into an account on sign-in.
- `lib/owner.ts` resolves whose data a request is about.

## Backtests

- Every run uses the Python engine.
- Decisions use the previous close and fill at today's close.
- Saved runs keep their exact input prices, so they can be reproduced.

## The daily job

`/api/cron/daily` runs on weekdays at 21:30 UTC. It catches up accounts, stores prices, runs the nightly analytics, sends alerts and handles competitions.

```bash
CRON_SECRET=test npm run dev
curl -H 'authorization: Bearer test' localhost:3000/api/cron/daily
```
