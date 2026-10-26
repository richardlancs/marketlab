# MarketLab analytics (Python)

A FastAPI service that does all of MarketLab's numerical work. Only the Next.js server calls it, with a shared token. See [What runs where](../../docs/how-it-works.md#what-runs-where).

- **Backtests:** every strategy (buy and hold, the moving-average crossover, dollar-cost averaging, rebalancing, custom rules, momentum rotation, risk parity), and parameter sweeps with the deflated Sharpe ratio of the best result. It's MarketLab's only backtest engine.
- **Walk-forward tests** of the crossover, and **historical screens**.
- **Stored analytics:** each stock's risk and technical profile and its factor exposures, calculated nightly from the price store. These feed the stock pages and the Screener.
- **Portfolios:** performance against an index, risk, stress tests, a Monte Carlo projection, the goal planner and optimisation (SciPy), and factor exposures (statsmodels).
- **The options lab:** Black-Scholes prices and Greeks, implied volatility, a simulated chain and strategy payoffs.
- **The machine-learning sandbox:** small scikit-learn models tested walk-forward against luck and buy and hold.
- **SEC company numbers:** fetched by company number and parsed.
- **Nightly jobs:** indicator alerts, portfolio snapshots, stock profiles and factors, in one time-boxed runner.

Modules:

- The engine: pure functions on plain data, with no FastAPI involved, so it works in notebooks and tests. Each part is its own module:
  - `analytics/data.py`: validates prices and aligns them into trading sessions;
  - `analytics/indicators.py`: trailing indicators, each already ending at the previous session;
  - `analytics/strategies.py`: decisions, made from completed sessions only;
  - `analytics/execution.py`: fills at the session's close, with commission and slippage;
  - `analytics/accounting.py`: cash, shares and a ledger row per session;
  - `analytics/metrics.py`: returns, drawdown, volatility, Sharpe and exposure;
  - `analytics/engine.py`: runs them in order and is the public interface (`run_config`, `Config`, `Outcome`);
  - `analytics/overfitting.py`: the deflated Sharpe ratio, for sweeps and the sandbox.
- Analytics built on the price store:
  - `analytics/store.py`: reads stored daily bars and writes `analytics_result` rows, with checksums and `ANALYTICS_VERSION`;
  - `analytics/technicals.py`: standard indicators as of a close (SMA, EMA, RSI, MACD, Bollinger, ATR);
  - `analytics/profiles.py`: a stock's risk and technical profile;
  - `analytics/factors.py`: factor returns from MarketLab's universe, and exposures by regression;
  - `analytics/portfolio.py`: portfolio risk, stress tests, Monte Carlo and optimisation;
  - `analytics/plan.py`: the goal planner;
  - `analytics/performance.py`: a portfolio's value history rebuilt from its trades, and its performance;
  - `analytics/walkforward.py`: walk-forward testing;
  - `analytics/screens.py`: historical screening, a stock screen applied every month from the prices known then (see [Historical screening](#historical-screening)).
- `analytics/options.py`: Black-Scholes, implied volatility, the simulated chain and payoffs.
- `analytics/ml.py`: the machine-learning sandbox, with snapshots for saving and reproducing.
- `analytics/fundamentals.py`: SEC company facts, fetched and parsed.
- Nightly: `analytics/jobs.py` (the runner, and stock profiles in time-boxed batches), `analytics/alerts.py` (indicator alerts), `analytics/snapshots.py` (portfolio snapshots).
- `analytics/api.py`: the HTTP layer: Pydantic models, authentication and limits.
- `analytics/db.py`, `analytics/saved.py`: MarketLab's database, for saving and reproducing runs (see [Database access](#database-access)).
- `main.py`: the entry point (`main:app`) for uvicorn and Vercel.
- `tests/` (with `tests/fixtures/`, fixed inputs and expected results):
  - `test_engine.py`, `test_timing.py`: the engine's rules, the timing rule and no look-ahead, warm-up, missing and duplicate data, costs, and the ledger;
  - `test_golden.py`: 23 fixed cases across every strategy, with exact results (from the former TypeScript engine, which this one matched to the last digit);
  - `test_api.py`, `test_sweep.py`: authentication, validation and limits; sweeps and the overfitting check;
  - `test_saved.py`: saving and reproducing through the database (a throwaway SQLite file built from `drizzle/*.sql`), and the Turso HTTP client;
  - `test_analytics.py`, `test_screens.py`: indicators, profiles, portfolio analysis, walk-forward tests and historical screening;
  - `test_performance.py`, `test_fundamentals.py`, `test_alerts.py`: against cases made by MarketLab's TypeScript code (accounts from real orders, SEC inputs, alert triggers), so moving each calculation here changed nothing;
  - `test_factors.py`, `test_plan.py`, `test_options.py`, `test_ml.py`, `test_nightly.py`: the Phase 16 tools and the nightly runner.

## Setup

Requires Python 3.12–3.14 and [uv](https://docs.astral.sh/uv/) (install with `brew install uv`, `pipx install uv` or `pip install uv`). Dependencies are pinned in `pyproject.toml` and locked in `uv.lock`; `exclude-newer` makes re-locking reproducible.

```bash
npm run analytics:install      # = cd services/analytics && uv sync --extra dev --locked
```

## Running it locally

`npm run dev` (in the project root) starts this service alongside Next.js, on `127.0.0.1:8000` with a throwaway token for that session. To run it on its own:

```bash
# .env.local (placeholders: use your own random value)
ANALYTICS_URL=http://127.0.0.1:8000
ANALYTICS_SERVICE_TOKEN=<openssl rand -base64 32>
```

```bash
npm run analytics:dev          # uvicorn on http://127.0.0.1:8000 (reads ../../.env.local)
npm run dev:web                # Next.js only, in another terminal
curl http://127.0.0.1:8000/health
```

## Tests

```bash
npm run test:python            # all Python tests
```

## API

Phase 16 endpoints, briefly (each validates its input; see `analytics/api.py` for the models):

| Endpoint | What it does |
|---|---|
| `POST /v1/backtests/sweep` | Every point of a parameter sweep on one set of prices: each point's metrics, the benchmark, and the deflated Sharpe check |
| `POST /v1/portfolio/performance` | A portfolio's value history from its trades, against an index, using its nightly snapshots for past closes |
| `POST /v1/analytics/plan` | The goal planner |
| `POST /v1/analytics/factors/refresh` | Rebuild the factors and every stock's exposures, if prices changed |
| `POST /v1/analytics/portfolio/factors` | A portfolio's factor exposures at today's weights |
| `POST /v1/options/chain` · `/price` · `/implied-volatility` · `/payoff` | The options lab |
| `POST /v1/ml/run` · `/v1/ml/saved` · `/v1/ml/saved/{id}/reproduce` | The machine-learning sandbox, and saving and reproducing its runs |
| `POST /v1/fundamentals/company` | A company's SEC numbers, fetched by CIK and parsed |
| `POST /v1/jobs/nightly` | The nightly runner: indicator alerts, portfolio snapshots, stock profiles, factors |


Every `/v1` request needs `Authorization: Bearer <ANALYTICS_SERVICE_TOKEN>`. Errors are JSON, as `{ "error": "...", "problems"?: [...] }`.

### `GET /health`

No token needed. Returns `{ "status": "ok", "engine": { "name": "python", "version": "1.3.0" } }`. Next.js reads the version, and includes it in each result's cache key.

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
  "market": null,                   // { "times", "prices" } of the index, required when benchmark = "market"
  "warmup": "within-period",        // optional; or "pre-start" (see "Warm-up" below). Next.js doesn't send it.
  "includeLedger": false            // optional; true adds each session's books and the decisions to both runs
}
```

Response, with the same shapes as MarketLab's `BacktestOutcome` type (`lib/backtest/config.ts`):

```jsonc
{
  "engine": { "name": "python", "version": "1.3.0" },
  "run":       { "equity": [{ "time": ..., "price": ... }], "trades": [{ "time", "symbol", "side", "shares", "price", "commission" }],
                 "metrics": { "finalValue", "totalReturn", "cagr", "maxDrawdown", "drawdownPeak", "drawdownTrough",
                              "volatility", "sharpe", "trades", "exposure" },
                 "ledger": null,     // with includeLedger: [{ "time", "cash", "shares": { "AAPL": ... }, "holdingsValue", "totalValue", "decided" }]
                 "decisions": null   // with includeLedger: [{ "time", "target": { "AAPL": 1 }, "basedOn" }]
               },
  "benchmark": { ...same shape... },
  "warnings":  ["The 100-day average needs 100 days of prices before the first signal; ..."],
  "assumptions": { "signals": "Decisions use closes up to the previous trading day only; ...", ... },
  "warmup": "within-period"
}
```

| Status | Meaning |
|---|---|
| 200 | Calculated. |
| 401 | Missing or wrong token. |
| 413 | Body over 2 MB. |
| 422 | Invalid settings or prices: a window that isn't short < long, weights not adding up to 1, duplicate or unsorted dates, missing prices, prices that aren't positive and finite, too little history (under 2 shared days), or more than 4,000 points in a series. |
| 503 | No token configured on the service. |

The Next.js side (`lib/backtest/python-client.ts`) waits up to 10 seconds (`ANALYTICS_TIMEOUT_MS`). It validates the response before using it and turns every failure into a message for the user. It never falls back to TypeScript.

### `POST /v1/saved-runs`

Calculates a run from a price snapshot **itself**, then saves the result and the snapshot to the database for `ownerId`.

**Body:**
- `ownerId`
- `run`: `{ id, name, createdAt }`
- `config`
- `snapshot`: the `PriceSnapshot` from `lib/backtest/snapshot.ts`
- `dataset`: `{ checksum, datasetVersion, source, simulated, asOf, firstDate, lastDate, observations }`
- `note`
- `assumptions`

**Returns** `{ summary, result }`, where `result` is a `StoredResult`, the same JSON shape the TypeScript side stores.

**Errors:** 404 for an unknown owner, 409 when the owner already has 50 saved runs, 503 when the database is down.

### `POST /v1/saved-runs/{id}/reproduce`

**Body:** `{ ownerId }`.

Reads that owner's saved run and its snapshot from the database, recalculates from the saved prices, and compares the new result with the stored one.

**Returns** `{ reproduced, comparison: { matches, largestDifference, differences } }`.

**Errors:**
- 404 for a missing run, or someone else's;
- 409 for a run saved before results were kept (runs saved by the former TypeScript engine are reproduced here, and any difference is reported);
- 503 when the database is down.

### `POST /v1/analytics/stock-profiles`

**Body:** `{ source: "mock" | "tiingo", symbols?: string[], budgetMs?: number }`.

It recalculates the stock profiles that are missing, or whose prices or `ANALYTICS_VERSION` changed, and stops when `budgetMs` (default 8,000) runs out.

**Returns:** `{ computed, unchanged, missing, failed, remaining, ms }`. Call it again with `remaining` to continue.

### `POST /v1/analytics/portfolio`

**Body:** `{ source, holdings: [{ symbol, value, sector? }], cash }`, with up to 30 holdings.

It analyses today's weights using stored prices: risk, each holding's share of the risk, correlations, VaR, stress tests, a Monte Carlo projection and optimised weightings. See `analytics/portfolio.py`. Nothing is saved.

**Returns:** `{ analysis, inputChecksum, version }`.

### `POST /v1/backtests/walk-forward`

**Body:** `{ source, config, fast: { from, to, step }, slow: { from, to, step }, trainYears: 1–3, testMonths: 3 | 6 | 12 }`.

For a moving-average `config`, it tests up to 100 (short, long) pairs. On each training window it picks the pair with the best Sharpe ratio, then runs it on the next test window. Results include each fold and the chained out-of-sample curve, next to the fixed settings and buy and hold.

### `POST /v1/screens/history`

**Body:** `{ source, config }`. The `config` is `{ version: 1, preset: "momentum", start, end, initialCash, costs, universe }`, where `universe` holds 1 to 200 symbols (MarketLab sends its catalog).

It builds a universe snapshot from the stored prices and runs the screen on it. Nothing is saved.

**Returns:** `{ result }`, with:
- `run` and `benchmark` (the same shapes as a backtest's), plus the benchmark's `dividends`;
- `period`, `warnings`, `costs`, `turnover` and `months` (each month's picks, explanations, trades and every candidate's numbers);
- `universe` and `provenance`.

Returns 422 when no stock can be ranked in the period.

### `POST /v1/saved-screens` and `POST /v1/saved-screens/{id}/reproduce`

These save and reproduce historical screens, as `/v1/saved-runs` does for backtests:
- **Saving:** `{ ownerId, run, source, config }`. It recalculates the screen from the store, then saves the result and its snapshot with `kind = 'historical-screen'`.
- **Reproducing:** `{ ownerId }`. It recalculates from the saved snapshot only, then compares the curves, trades, metrics and every month's picks.

**Errors:**
- 404 for someone else's run, or for a backtest's ID;
- 409 when the 50-run limit is full.

## Historical screening

`analytics/screens.py`. Its module docstring states every rule. In short:
- **Inputs:** a *universe snapshot*, built from the store and saved with a run. It holds the market's trading days from 274 sessions before the start, and each candidate's adjusted close on each day, with `None` where it has none. Live runs and reproductions both calculate from a snapshot, so they share one code path.
- **Decisions:** on session D, `rank()` gets `closes[:D]`, so D's own close and anything later are out of reach. Tests check that changing later prices, or D's own close, leaves earlier decisions unchanged.
- **Measures:** 12-1 momentum and the 200-day average use `profiles.py`'s definitions, and percentiles use `screener.ts`'s. A stock qualifies with the top fifth of momentum and above its average. Picks are the top five by momentum, ties broken alphabetically, at 20% each.
- **Execution:** `execution.buy`/`sell` (the backtests' costs and rules). The benchmark is `engine.BuyAndHold` on the index, and the metrics are `metrics.compute_metrics`.
- **Versions:** `SCREEN_VERSION` is recorded as the run's `method`. A reproduction made with another version says so.

## Stored analytics

**Price store**
- The Next.js server copies each source's daily bars into `daily_bar`, one `price_series` row per symbol.
- Each `price_series` row holds the series' SHA-256 checksum and its latest fundamentals.
- An unchanged series is skipped and new days are appended. A whole series is rewritten when a dividend or split rescales its adjusted past.

**Results**
- This service reads that table and writes `analytics_result` rows: one per kind and subject, for example `stock-profile` / `AAPL`.
- Each row records the checksum of the prices it used, `ANALYTICS_VERSION` and its last close. So a job skips anything unchanged, and a new analytics version recalculates everything once.

**The daily job** (`lib/maintenance.ts`), after catching up accounts:
1. syncs every catalog stock and index;
2. calls `/v1/analytics/stock-profiles` in roughly 8-second calls until nothing remains.

A page that finds a profile missing, or older than the latest close, does the same for that one stock on the spot. So pages work before the job has ever run, including locally.

**Profile conventions** (`profiles.py`, `technicals.py`)
- **Returns** are simple daily returns of adjusted closes, so dividends are included.
- **Indicators** use closes through the latest one, the charting-site definitions. A backtest decision for day D uses `indicators.py` instead, which ends at D−1; strategies never import `technicals.py`.
- **Beta and correlation** are measured against the S&P 500, on the days both have prices.
- **VaR and expected shortfall** are one-day, 95%, historical, over the last year.
- **Dividends** are recovered from the ratio between adjusted and traded closes.

## Database access

The service uses MarketLab's own database, through the same `DATABASE_URL` and `DATABASE_AUTH_TOKEN` as the Next.js server:
- **Locally (no `DATABASE_URL`):** the repository's `local.db`, through Python's `sqlite3`.
- **Online (`libsql://…`):** Turso's HTTP API (`/v2/pipeline`) through `httpx`. That needs no native driver, so nothing has to compile on Vercel.

What it reads and writes:
- **It writes** Python-engine saved runs (`backtest_run`, with their result and provenance columns), their snapshots (`price_snapshot`, stored once per checksum) and stored analytics (`analytics_result`).
- **It reads** a saved run and its snapshot to reproduce it, and stored prices (`daily_bar`, `price_series`) for analytics. It never writes prices: the Next.js server does.
- **The Next.js server still** lists and opens saved runs, and handles everything else: accounts, guests, lesson progress, and TypeScript-engine runs.

Ownership:
- **The service never decides who is asking.** The Next.js server checks the session or guest cookie and the rate limits, then sends the owner's ID. The service accepts that only on requests carrying the service token, which only the Next.js server has.
- **Every query is limited to that owner's rows.**
- **Every write is one SQL statement, so it's atomic:** a run is inserted only if its owner exists and has fewer than 50 runs. A snapshot left behind by a refused run is removed by the daily job.

The schema is defined once, in Drizzle (`lib/db/schema.ts` and `drizzle/`). The Python code uses those same tables and columns, and its tests build their database from the same migration files, so a schema change that breaks the Python side fails its tests.

## The timing rule

A *session* is a day with a recorded close for every stock in the run. Weekends, holidays and any day a series lacks aren't sessions, so "the previous session" is the previous day with prices, not the previous calendar day.

For every session D, in this order:

1. **Decide.** The strategy sees sessions up to D−1 only: their closes, and indicators computed from them. Session D's prices don't exist yet.
2. **Execute.** Its orders fill at D's close, plus or minus slippage.
3. **Value.** The portfolio is valued at D's close. That's D's equity and its ledger row.

So **a signal formed from session D's close trades at session D+1's close**, never sooner and never later.

How the code enforces it:
- **Indicators are shifted once, and only once.** `sma_through_previous(closes, n)[D]` is the mean of closes D−n … D−1. Strategies use the value at D as it is. Shifting again would delay every signal by another session.
- **Strategies never get a future price.** On session D a strategy receives a `DecisionContext` with:
  - a `History` view that raises `LookAheadError` for session D or later;
  - the indicator values for D;
  - the holdings and cash before D's orders.

  Session D's close is passed only to execution and accounting.
- **Tests prove it** (`tests/test_timing.py`):
  - changing any prices after D leaves every equity value, trade, ledger row and decision through D unchanged;
  - changing D's own close doesn't change D's decision, only its fill price;
  - a jump in D's close is first traded at D+1's close;
  - a run cut off at session D equals the full run through D;
  - a strategy that reads today's close is stopped.

### Moving-average crossover

- **Defaults:** 50 and 200 sessions (`MovingAverageCrossover(weights)`). MarketLab's page sends its own values.
- **Rule:** hold a stock, at its weight, while its short average is *strictly above* its long average. **Equal averages mean cash.**
- **Trades only on a change:** it asks for a trade only when some stock's wanted position (held or not) differs from the current one.
- **Selling out sells every share,** so no fractional sliver is left that would still count as a position.

### Warm-up

The long average needs `slow` earlier sessions. Until then nothing is decided and the money stays in cash.

- **`within-period` (the default, and what MarketLab uses):** the first `slow` sessions of the chosen period are the warm-up. They're held in cash and still count in every metric. If the period is too short, a warning says the strategy never traded.
- **`pre-start` (API option):** up to `slow` sessions *before* the start date are used as earlier history, if the prices sent include them. They're never measured: equity, trades, metrics and the benchmark all start on the start date. Nothing is invented. If fewer earlier sessions exist, it uses those, and a warning says how many measured sessions the warm-up took.

### A worked example

One stock, $1,000, a 2/4-session crossover, a $1 commission and 10 bps slippage. Each row's averages end at the *previous* session (`within-period` warm-up):

| Session | Close | 2-avg (to D−1) | 4-avg (to D−1) | Decision | Fill | Cash | Shares | Value at close |
|---|---|---|---|---|---|---|---|---|
| 1 | 10 | – | – | warming up | – | 1,000.00 | 0 | 1,000.00 |
| 2 | 10 | – | – | warming up | – | 1,000.00 | 0 | 1,000.00 |
| 3 | 10 | 10.0 | – | warming up | – | 1,000.00 | 0 | 1,000.00 |
| 4 | 10 | 10.0 | – | warming up | – | 1,000.00 | 0 | 1,000.00 |
| 5 | **12** | 10.0 | 10.0 | equal: cash | – | 1,000.00 | 0 | 1,000.00 |
| 6 | 13 | **11.0** | **10.5** | short above long: buy | buy 76.7694 @ 13.013 | 0.00 | 76.7694 | 998.00 |
| 7 | 11 | 12.5 | 11.25 | still held | – | 0.00 | 76.7694 | 844.46 |
| 8 | **9** | 12.0 | 11.5 | still held | – | 0.00 | 76.7694 | 690.92 |
| 9 | 9 | **10.0** | **11.25** | short below long: sell | sell 76.7694 @ 8.991 | 689.23 | 0 | 689.23 |
| 10 | 10 | 9.0 | 10.5 | cash | – | 689.23 | 0 | 689.23 |

- **Session 5:** the jump to 12 happens at session 5's close, which session 5's decision can't see. It shows in session 6's averages, so the buy fills at session 6's close of 13 (13.013 after slippage). It spends $999, the cash left after the commission.
- **Session 9:** the drop to 9 on session 8 shows in session 9's averages, so the sell fills at session 9's close: 9 × 0.999 = 8.991, less $1.
- **Result:** 2 trades, a final value of $689.23 (−31.1%), and exposure of 30% (invested on 3 of 10 sessions).

To print this yourself, see [Using the engine directly](#using-the-engine-directly-notebooks).

## Simulation rules

- **Signal timing:** see [The timing rule](#the-timing-rule).
- **Costs:** a fixed commission per order, and slippage in basis points that fills buys above the close and sells below it.
- **Cash and shares:**
  - shares are fractional;
  - a buy spends at most the cash left after its commission;
  - a sell can't exceed the shares held, and a sell to a 0% target sells every share;
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

`tests/fixtures/parity.json` holds fixed inputs and the TypeScript engine's exact results, generated by `lib/backtest/parity.test.ts` with `UPDATE_PARITY_FIXTURES=1`. The 23 cases cover:
- **every strategy:** buy and hold, crossovers, dollar-cost averaging, monthly and quarterly rebalancing, momentum rotation (with and without the absolute filter), risk parity, and custom rules using RSI, EMA, moving-average crosses, MACD, Bollinger Bands, the chandelier stop (ATR) and volume, combined with "all" and "any";
- **costs,** and both benchmark kinds;
- **two and three stocks,** and missing dates;
- **a date window,** and a warm-up longer than the data;
- **a commission larger than the cash;**
- **a sawtooth price** that forces many trades;
- **a crossover that sells out and buys back in.**

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
4. **Leftover shares after selling out (fixed in both engines, version 1.1.0).** A sell for a stock's whole value computed its shares as value ÷ close. Rounding could make that a hair less than the shares held, leaving about 1e-14 of a share. That sliver counted as "held", which caused three problems:
   - the crossover and the rule builder never bought that stock again;
   - exposure counted those days as invested;
   - with two stocks, the strategy re-sent its target every day, which rebalanced the other stock in small trades.

   A sell to a 0% target now sells every share. Results calculated by engine 1.0.0 can differ: on the AAPL 20/50 parity case, 6 trades became 21 and exposure went from 79% to 50%. Reproducing a 1.0.0 run under 1.1.0 says that the engine version changed.

## Using the engine directly (notebooks)

```python
from analytics import engine

prices = {"AAPL": engine.to_series("AAPL", times, closes)}
config = engine.Config(holdings=[("AAPL", 1.0)], strategy="moving-average", fast=20, slow=100,
                       start=times[0], end=times[-1], initial_cash=10_000,
                       costs=engine.Costs(commission=1, slippage_bps=5))
outcome = engine.run_config(config, prices)
outcome.run.metrics, outcome.run.trades[:3], outcome.benchmark.metrics
outcome.run.ledger[:5]      # DayRecord(time, cash, shares, holdings_value, total_value, decided) per session
outcome.run.decisions[:3]   # Decision(time, target, based_on): based_on is the previous session
```

Pass `warmup="pre-start"` to `Config` to use sessions before `start` as history. A custom strategy implements `indicators(sessions)` and `decide(ctx)` (see `analytics/strategies.py`). It reads the past through `ctx.history`, which refuses the session being decided.
