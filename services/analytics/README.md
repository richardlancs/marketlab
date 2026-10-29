# MarketLab analytics

FastAPI service for all of MarketLab's numerical work: backtests, portfolio analytics, stock profiles, forecasts, the trade review, the labs and the nightly jobs. Only the Next.js server calls it.

## Setup

Needs Python 3.12+ and [uv](https://docs.astral.sh/uv/).

```bash
npm run analytics:install
npm run analytics:dev      # http://127.0.0.1:8000
npm run test:python
```

`npm run dev` at the root starts it automatically.

## API

- `GET /health` needs no token.
- Every `/v1` route needs `Authorization: Bearer <ANALYTICS_SERVICE_TOKEN>`.
- Request and response models are in `analytics/api.py`.

## Timing rule

On each session D, the engine decides from closes through D−1, fills at D's close and values at D's close. `tests/test_timing.py` proves there's no look-ahead.

## Layout

| Path | |
|---|---|
| `analytics/engine.py` | Backtest engine |
| `analytics/api.py` | HTTP layer |
| `analytics/*.py` | One module per tool |
| `tests/` | Tests and fixtures |
