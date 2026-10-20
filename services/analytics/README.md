# MarketLab analytics (Python)

A FastAPI service that calculates backtests with the same rules as MarketLab's TypeScript engine (`lib/backtest/engine.ts`). The Next.js server calls it when `BACKTEST_ENGINE=python`. It supports **buy and hold** and the **moving-average crossover**; everything else stays on TypeScript.

- `analytics/engine.py`: the engine. Pure functions on plain data, with no FastAPI involved, so it works in notebooks and tests.
- `analytics/api.py`: the HTTP layer: Pydantic models, authentication and limits.
- `main.py`: the entry point (`main:app`) for uvicorn and Vercel.
- `tests/`:
  - `test_engine.py`: the engine's rules;
  - `test_api.py`: authentication, validation and limits;
  - `test_parity.py`: results compared with the TypeScript engine on fixed datasets.

## Setup

Requires Python 3.12–3.14 and [uv](https://docs.astral.sh/uv/) (install with `brew install uv`, `pipx install uv` or `pip install uv`). Dependencies are pinned in `pyproject.toml` and locked in `uv.lock`; `exclude-newer` makes re-locking reproducible.

```bash
npm run analytics:install      # = cd services/analytics && uv sync --extra dev --locked
```

## Running it locally

The service needs `ANALYTICS_SERVICE_TOKEN`. Without it, it refuses every `/v1` request. Put the same value in the project's `.env.local`, which both apps read:

```bash
# .env.local (placeholders: use your own random value)
BACKTEST_ENGINE=python
ANALYTICS_URL=http://127.0.0.1:8000
ANALYTICS_SERVICE_TOKEN=<openssl rand -base64 32>
```

```bash
npm run analytics:dev          # uvicorn on http://127.0.0.1:8000 (reads ../../.env.local)
npm run dev                    # Next.js, in another terminal
curl http://127.0.0.1:8000/health
```

Then run a buy-and-hold or moving-average backtest on `/backtest`. The line under the results says "Calculated by the Python engine 1.0.0".

## Tests

```bash
npm run test:python            # all Python tests
npm run test:parity            # TypeScript checks its fixture results, then Python checks against them
```

## API

Every `/v1` request needs `Authorization: Bearer <ANALYTICS_SERVICE_TOKEN>`. Errors are JSON, as `{ "error": "...", "problems"?: [...] }`.

### `GET /health`

No token needed. Returns `{ "status": "ok", "engine": { "name": "python", "version": "1.0.0" } }`. Next.js reads the version, and includes it in each result's cache key.

### `POST /v1/backtests`

JSON in camelCase, matching MarketLab's TypeScript types. Unknown fields are refused.

```jsonc
{
  "config": {                      // MarketLab's BacktestConfig (lib/backtest/config.ts)
    "version": 2,
    "holdings": [{ "symbol": "AAPL", "weight": 1 }],          // 1–5 stocks, weights adding up to 1
    "strategy": { "kind": "moving-average", "fast": 20, "slow": 100 },  // or { "kind": "buy-and-hold" }
    "start": 1634515200000, "end": 1792368000000,              // ms timestamps, start < end
    "initialCash": 10000,                                      // 100 to 10,000,000
    "costs": { "commission": 1, "slippageBps": 5 },            // 0–100 each
    "benchmark": "same-stocks"                                 // or "market"
  },
  "prices": {                       // each holding's adjusted daily closes, oldest first
    "AAPL": { "times": [1634673600000, ...], "prices": [148.76, ...] }
  },
  "market": null                    // { "times", "prices" } of the index, required when benchmark = "market"
}
```

Response, with the same shapes as the TypeScript engine's `BacktestOutcome`:

```jsonc
{
  "engine": { "name": "python", "version": "1.0.0" },
  "run":       { "equity": [{ "time": ..., "price": ... }], "trades": [{ "time", "symbol", "side", "shares", "price", "commission" }],
                 "metrics": { "finalValue", "totalReturn", "cagr", "maxDrawdown", "drawdownPeak", "drawdownTrough",
                              "volatility", "sharpe", "trades", "exposure" } },
  "benchmark": { ...same shape... },
  "warnings":  ["The 100-day average needs 100 days of prices before the first signal; ..."]
}
```

| Status | Meaning |
|---|---|
| 200 | Calculated. |
| 401 | Missing or wrong token. |
| 413 | Body over 2 MB. |
| 422 | Invalid settings or prices: a window that isn't short < long, weights not adding up to 1, duplicate or unsorted dates, prices that aren't positive and finite, too little history (under 2 shared days), or more than 4,000 points in a series. |
| 503 | No token configured on the service. |

The Next.js side (`lib/backtest/python-client.ts`) waits up to 10 seconds (`ANALYTICS_TIMEOUT_MS`). It validates the response before using it and turns every failure into a message for the user. It never falls back to TypeScript.

## Simulation rules (shared with the TypeScript engine)

- **Signal timing:** each day, a strategy sees closes up to the previous day only, and orders fill at that day's close, so there's no look-ahead. A moving-average crossover first trades once it has `slow` known closes, and only on a crossover.
- **Costs:** a fixed commission per order, and slippage in basis points that fills buys above the close and sells below it.
- **Cash and shares:**
  - shares are fractional;
  - a buy spends at most the cash left after its commission;
  - a sell can't exceed the shares held;
  - trades under $1 are skipped.
- **Targets:** a target sets each holding to a fraction of total value, and sells are filled before buys.
- **Dates:** only days every series has are used, within the start and end dates (inclusive). A day missing from one series is skipped for all.
- **Benchmark:** buy and hold of the same stocks (or of the market index), with the same money and costs, over exactly the strategy's days.
- **Metrics:**
  - CAGR is calendar-based (365.25-day years);
  - volatility is the sample standard deviation of daily returns × √252;
  - Sharpe is mean ÷ standard deviation × √252, with a 0% risk-free rate, and null when there's no variation;
  - drawdown is measured from the running peak.

**Adjustment and dividends.** Prices are split- and dividend-adjusted closes: past prices are scaled for later splits and dividends, so a dividend is already part of the return. The engines never add dividends separately, which would count them twice.

**Exact parity.** Averages and sums are added left to right, as JavaScript's `reduce` does. Python's `sum()` (3.12+) and NumPy use more accurate summation, which can differ in the last digit, and a crossover can turn that into a trade on a different day. pandas handles validation and date alignment.

## Parity with the TypeScript engine

`tests/fixtures/parity.json` holds fixed inputs and the TypeScript engine's exact results, generated by `lib/backtest/parity.test.ts` with `UPDATE_PARITY_FIXTURES=1`. The 8 cases cover:
- costs, and both benchmark kinds;
- two stocks, and missing dates;
- a date window, and a warm-up longer than the data;
- a commission larger than the cash;
- a sawtooth price that forces many trades.

| Compared | Tolerance |
|---|---|
| Dates, sides, symbols, trade counts | exact |
| Every number | relative 1e-9 |

**Observed:** identical in every case (largest difference 0). The tolerance only allows for platforms that round `pow()` and `sqrt()` differently.

## Differences from the TypeScript engine, and issues found there

The Python engine rejects some inputs the TypeScript engine accepts. These are documented here rather than changed in TypeScript:

1. **Duplicate dates.** TypeScript's `alignSeries` takes its days from the first series as given. A repeated date is simulated twice, with the last price for both, which adds a 0% day. Python refuses duplicate dates. MarketLab's market data has none, so the two never differ in practice.
2. **Non-finite or non-positive prices.** TypeScript doesn't check them, so a `NaN` would silently produce `NaN` results. Python refuses them.
3. **Benchmark in the mock market.** The mock market's indices pay no dividends (they're price indices), while its stocks are dividend-adjusted. A "market" benchmark therefore leaves out the index's dividends, which slightly flatters a strategy. Mock dividends began on Oct 19, 2026, so the effect is small for now but grows over time. With real data, the benchmark is SPY's adjusted price, which includes dividends.
4. **Tiny leftover shares (harmless, reproduced as-is).** After selling everything, floating-point rounding can leave a sliver of a share. A crossover then keeps asking to sell it, but the trade is under $1 and is skipped.

## Using the engine directly (notebooks)

```python
from analytics import engine

prices = {"AAPL": engine.to_series("AAPL", times, closes)}
config = engine.Config(holdings=[("AAPL", 1.0)], strategy="moving-average", fast=20, slow=100,
                       start=times[0], end=times[-1], initial_cash=10_000,
                       costs=engine.Costs(commission=1, slippage_bps=5))
outcome = engine.run_config(config, prices)
outcome.run.metrics, outcome.run.trades[:3], outcome.benchmark.metrics
```
