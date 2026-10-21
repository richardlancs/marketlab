# How MarketLab works

The details behind each feature. For setup, see the [README](../README.md).

- [Market data](#market-data)
- [Orders, dividends and alerts](#orders-dividends-and-alerts)
- [Accounts and guests](#accounts-and-guests)
- [Lessons and progress](#lessons-and-progress)
- [Research tools](#research-tools)
- [Backtests](#backtests)
- [The daily job](#the-daily-job)
- [Email](#email)

## Market data

Prices come from one of two sources.

**The mock market (the default)**
- Generated from fixed seeds: five years of daily prices.
- It moves forward one trading day at a time, following the real calendar.
- Each stock and index starts from its real price and market cap around Oct 16, 2026, and pays dividends at roughly its real yield (`lib/market/anchors.ts`).
- Only that starting point is real. The past before it and every move after it are simulated.
- Stocks move together, like real ones (`lib/market/factors.ts`). Each day's move is:
  - the market's move times the stock's beta (typical for its sector: utilities ≈ 0.5, semiconductors ≈ 1.5), plus
  - its sector's own move, plus
  - company-specific noise.
- The market follows the S&P 500's real path roughly, through real turning points such as the 2022 bear market and the April 2025 sell-off.
  - Volatility clusters (calm and stormy stretches), and big moves are more common than a bell curve suggests.
  - The Nasdaq and the Dow are built from the same factors.
- So beta, correlation, diversification and stress tests behave as they would with real data.

**Tiingo (real end-of-day prices)**
- Used when `TIINGO_API_KEY` is set.
- The free plan allows 50 requests an hour and 1,000 a day.
- A request budget (`lib/market/budget.ts`) stops extra tickers from crowding out the dashboard.
- It has no market cap or P/E, so those show "—".

> **Licensing.** Tiingo's free plan is for personal use only. A public deployment must leave `TIINGO_API_KEY` unset. On Vercel, the key is ignored unless `MARKET_DATA_PRIVATE=1` is also set.

**If Tiingo can't be reached**
- The dashboard falls back to the mock market, shows a notice, and retries a minute later.
- Other stocks never fall back to made-up prices: they show "prices unavailable".
- `MARKET_DATA_SOURCE=mock` forces the mock market even when a key is set.

**Which stocks exist**
- **Core:** the 10 stocks and 3 indices in `lib/market/universe.ts`. They're pre-rendered at build time.
- **Catalog:** about 95 stocks in `lib/market/catalog.ts`. Each page is built on its first visit. With mock data, these are the whole market.
- **Any ticker (Tiingo only):** search offers "Open this ticker" for unlisted symbols.

**Company logos**
- Each stock shows its logo in a rounded tile beside its ticker. The tile is the same light colour in every theme, the way app icons are.
- The logos ship with the site, in `public/logos/`, so visitors never load anything from a third party. `npm run logos:fetch` downloads them from the websites in `lib/market/logos.ts` and writes `lib/market/logo-files.ts`.
- Each logo comes from the first of these that works:
  1. the company's own site icon, if it's at least 96px;
  2. its mark from [Simple Icons](https://simpleicons.org), in the brand colour;
  3. a smaller site icon, if it's at least 48px.
- A stock with none of these (or an index, or another ticker with real data) gets its first letter on an accent-tinted tile.
- The marks remain their owners' trademarks and are shown only to identify each company.

**Charts**
- Every chart follows the range chosen (1D to 5Y).
- A line is green if it ended the range higher than it started, and red if lower.
- With the mock market, 1D–1M charts show 5-minute prices built from each day's open, high, low and close (`lib/market/intraday.ts`).
- Real data stays daily: no intraday prices are invented for it.

**Filings and news**
- SEC filings come from EDGAR, and need `SEC_USER_AGENT` to be set.
- News headlines come from Tiingo, and only show with your own key.

## Orders, dividends and alerts

Prices are end-of-day, so everything waiting for a price is checked at the close:
- **Limit orders** fill at a close at or better than your price.
- **Stop orders** fill once a close reaches your level. They fill *at that close*, which can be much worse after a jump.
- **Expiry:** an order lasts up to 90 days.
- **Dividends and splits** apply on the ex-date to the shares you held at the previous close. A fractional share left by a split is paid in cash.
- **Price alerts** trigger on the first close past their level.
- **Indicator alerts** (`lib/alerts.ts`) trigger on the first close where their condition becomes true:
  - RSI(14) crosses a level;
  - the close crosses its N-day average;
  - the day's move is at least X%;
  - a new 52-week high or low.

  They use split-adjusted closes, so a split never looks like a crash.

One function, `lib/processing.ts`, catches an account up with the market. It runs in three places: the daily job, opening the site, and trading. It's safe to run twice: nothing is paid or filled twice.

## Accounts and guests

Every account lives in the database (`lib/db/`).

**Guests**
- A guest is a `user` row with `is_guest`. It has no password and no session.
- A browser is tied to its guest by the httpOnly `marketlab_guest` cookie.
- The cookie is created on the first change worth saving: a trade, a watched stock, an alert, a saved backtest or a quiz answer. Visitors who only look around create nothing.

**`lib/owner.ts`** works out whose data a request is about: the signed-in user, or the guest in the cookie. So one code path serves both.

**Signing in as a guest** hands the guest's data over in one transaction (`lib/db/guests.ts`):
- lesson progress and saved backtests are merged in;
- the portfolio moves over if the account has none;
- if both have a portfolio of their own, the user chooses which to keep.

**Limits:** accounts can hold and watch up to 30 stocks.

## Lessons and progress

**The lessons**
- 29 lessons at `/learn/<slug>`, stored in `lib/lessons/`.
- Each is 3–5 minutes, with a worked example, a demo for most, and an optional quiz.
- `lessons.test.ts` enforces the format and recomputes every worked example.
- The demos use arithmetic only, so the server and the browser draw identical charts.

**Progress**
- What's saved: quiz answers (including unfinished ones), best scores and passes.
- Where: with the account when signed in; with the guest otherwise. It merges on sign-in.
- How it's scored: `lib/learn-actions.ts` receives only the chosen answer and marks it on the server, so a request can't claim a pass.

## Research tools

These are calculated by the Python analytics service ([its README](../services/analytics/README.md)) from a price store in the database. The pages read the stored results.

**Price store and nightly analytics**
- The daily job copies every catalog stock's and index's daily bars, with market cap, P/E and dividend yield, into `daily_bar` and `price_series` (`lib/db/prices.ts`). Unchanged series are skipped.
- It then has the service recalculate whatever changed (`lib/analytics/server.ts`).
- A page that finds a result missing, or behind the latest close, calculates it on the spot instead of waiting for the job.

**Stock pages: Risk and Technicals cards**
- **Risk:**
  - volatility (1 and 3 years) and a rolling-volatility chart;
  - beta and correlation with the S&P 500;
  - maximum drawdown and how long it took to recover;
  - one-day 95% VaR and expected shortfall;
  - best and worst days, and a histogram of daily returns;
  - period returns.
- **Technicals:**
  - 50- and 200-day averages, and the 20-day EMA;
  - RSI, MACD, Bollinger Bands and ATR;
  - relative volume;
  - states such as "Golden cross since …".

**Screener (`/screener`)**
- Every catalog stock with momentum 12-1, volatility, beta, RSI, distance from its high, yield, market cap and P/E (`lib/analytics/screener.ts`).
- Filtering and sorting happen in the browser, so they're instant.
- Presets: momentum leaders, low volatility, oversold in an uptrend, dividend payers, defensive.
- "Backtest the top 5" opens buy-and-hold of the results, with a warning about look-ahead.

**Portfolio: Risk analysis** (`app/api/portfolio/analysis`; holdings are read on the server)
- **Risk:** volatility, beta, VaR, the diversification ratio, each holding's share of the risk, a correlation heatmap and sector exposure.
- **Stress tests:** the market's worst falls in the data, replayed on today's weights, plus beta-scaled hypothetical shocks.
- **Projection:** a 10-year Monte Carlo of 2,000 paths from month-long blocks of the portfolio's own daily returns.
- **Optimise:** least-risk, best-Sharpe and risk-parity weightings of the same stocks, and the efficient frontier. These come from SciPy, long-only, with shrunk estimates.

## Backtests

**Strategies:**
- buy and hold, moving-average crossover, dollar-cost averaging, rebalancing;
- custom rules (price, averages, RSI, MACD, Bollinger Bands, a chandelier trailing stop on ATR, and volume against its average);
- momentum rotation (hold the top N of your stocks by trailing return, optionally only if positive);
- risk parity (weights by inverse volatility).

Each run uses up to five stocks, with trading costs and a benchmark.

**More measures** (`lib/backtest/analysis.ts`) under every result:
- **Risk-adjusted:** Sortino and Calmar.
- **Against the benchmark:** beta, alpha, correlation, tracking error and information ratio.
- **Trades:** round trips, win rate, average win and loss, holding period, turnover, and costs paid (commission plus slippage).

**Overfitting checks**
- **Sweeps:** a sweep reports the deflated Sharpe ratio of its best cell (`lib/backtest/overfitting.ts`): how likely it is to be real, given how many settings were tried.
- **Walk-forward test:** a crossover sweep over both averages offers one. It picks the best pair on each past window, tests it on the next unseen one, and compares the result with fixed settings and with buy and hold.

**How a run works.** The browser sends only the settings. The server (`lib/backtest/server.ts`):
1. checks them and the per-visitor rate limit;
2. loads the prices;
3. runs the engine.

Results are cached by the settings, the dataset's checksum and the engine's version.

**Two engines.** `BACKTEST_ENGINE` chooses between:
- `typescript`: `lib/backtest/engine.ts`;
- `python`: [`services/analytics`](../services/analytics/README.md).

With `python`:
- every strategy runs on Python; parameter sweeps stay on TypeScript;
- every result names its engine and version;
- a Python failure shows an error and never falls back to TypeScript.

Both engines give identical results on fixed datasets (`npm run test:parity`).

**Timing rule.** For each trading session D, both engines:
1. decide from closes through the previous session (D−1);
2. fill the orders at D's close;
3. value the portfolio at D's close.

A missing day is skipped for every stock, never filled in. The Python README has a worked example and the no-look-ahead tests.

**Saved runs keep:**
- their full result;
- an immutable snapshot of the exact input prices (stored once per SHA-256 checksum);
- the engine and its version.

**Actions on a saved run**

| Action | What it does |
|---|---|
| Open | Shows the stored result without recalculating. |
| Reproduce from saved inputs | Recalculates from the snapshot and reports whether the result is identical, or whether the engine version changed. |
| Re-run with current prices | A fresh run. |

**Never mixed:** real and simulated prices are never combined in one run.

**Settings versions:** settings carry a `version`. Older settings are upgraded when read; newer ones are refused rather than misread.

Rules that use a chandelier stop or volume need each day's high, low and volume. Only those runs load them, and their snapshots keep them, so every other snapshot is unchanged.

**Python engine 1.2.0** adds the strategies above (all bit-identical with TypeScript on the parity fixtures). **Engine 1.1.0 fix.** It fixes a bug in both engines: selling out could leave a sliver of a share that still counted as held. Crossover and rule strategies then never bought that stock again, and exposure was overstated. Runs saved under 1.0.0 may differ when reproduced.

## The daily job

`/api/cron/daily` (`lib/maintenance.ts`) runs on weekdays at 21:30 UTC, after the New York close. It:
- loads fresh market data;
- catches up every account, in batches of about 50 seconds;
- with the time left, stores the latest prices and recalculates stored analytics (see [Research tools](#research-tools));
- deletes guests unused for 180 days, old rate-limit counters, and snapshots no saved run uses.

Only requests carrying `CRON_SECRET` are accepted.

To run it locally:

```bash
CRON_SECRET=test npm run dev
curl -H 'authorization: Bearer test' localhost:3000/api/cron/daily
```

## Email

**Sending** (`lib/email.ts`)
- Through Gmail's SMTP server: set `SMTP_USER` and `SMTP_PASS` (a Google app password).
- Resend's API still works as an alternative: `RESEND_API_KEY` and `EMAIL_FROM`.
- Without either, production sends nothing and offers nothing that needs email. In development each email is printed to the server console.
- Guests' placeholder addresses are never mailed.

**Verification:** signing up sends a 24-hour link that confirms the address. It doesn't block signing in.

**Alert emails** (`lib/alert-emails.ts`)
- **Opt-in:** a signed-in user with a confirmed address turns them on under the alerts on the watchlist page.
- **The digest:** after catching up accounts, the daily job sends each of them one email listing the alerts that triggered. It skips alerts they've already seen in the app, and alerts more than a week old.
- **Once only:** each alert is emailed once (`price_alert.emailed_at`).
- **Unsubscribing:** every email has a signed unsubscribe link. Opening it asks for confirmation, so link scanners can't unsubscribe anyone, and mail apps' one-click unsubscribe works too (RFC 8058).
