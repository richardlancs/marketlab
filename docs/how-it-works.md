# How MarketLab works

The details behind each feature. For setup, see the [README](../README.md).

- [What runs where](#what-runs-where)
- [Market data](#market-data)
- [Orders, dividends and alerts](#orders-dividends-and-alerts)
- [Accounts and guests](#accounts-and-guests)
- [Lessons and progress](#lessons-and-progress)
- [Research tools](#research-tools)
- [Backtests](#backtests)
- [The daily job](#the-daily-job)
- [Email](#email)
- [Installing and push notifications](#installing-and-push-notifications)
- [Phones and accessibility](#phones-and-accessibility)
- [Competitions and badges](#competitions-and-badges)

## What runs where

MarketLab is two services in one Vercel project: the Next.js app, and a private Python analytics service (`services/analytics`) that only the Next.js server can call, with a shared token.

```
Browser ──▶ Next.js (pages, Server Actions, API routes)
              │  accounts, trading, orders, price alerts, guests, email, push
              │  market data, the price store sync, caching
              │
              └──▶ Python analytics service (FastAPI, pandas, SciPy, statsmodels, scikit-learn)
                      backtests, sweeps, walk-forward tests, historical screens
                      portfolio performance, risk, projection and the goal planner
                      stock profiles and factor exposures
                      the options lab, the machine-learning sandbox
                      SEC company numbers (fetched and parsed)
                      nightly: indicator alerts, portfolio snapshots, profiles, factors
              both ──▶ Turso (SQLite)
```

**In Next.js:** everything that changes an account (trades, orders, dividends and splits, price alerts), because a visit catches the account up as well as the nightly job, with the same rules as live trading (`lib/trading.ts`, `lib/processing.ts`).

**In Python:** the numerical work. There's one copy of each calculation: no TypeScript backtest engine to keep in step. The only TypeScript engine left is the small one the Learn demos run in the browser (`lib/backtest/engine.ts`), checked against the same golden results as the Python engine. Price-dependent ratios such as P/E are worked out in Next.js, next to today's price.

**When the service is down or waking up:** calls are retried once (a service that sleeps when idle can refuse the first connection), cards show "Try again" and retry once by themselves, and nothing falls back to another calculation.

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
- So do company numbers (below).
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

**Company numbers (SEC filings)**
- What each company reported in its 10-K and 10-Q filings, from the SEC's free "company facts" API. The data is public, so it shows on the public site even though prices there are simulated.
- The analytics service fetches each company's facts file from the SEC by its company number (CIK; Next.js keeps the ticker-to-CIK map) and parses it (`services/analytics/analytics/fundamentals.py`):
  - five fiscal years of revenue, gross profit, operating income, net income, diluted EPS, equity and free cash flow;
  - the last four quarters added up, working out quarters reported only year-to-date.
- Ratios at today's price are worked out in Next.js, next to the price (`lib/market/fundamentals.ts`): P/E (market value ÷ trailing net income), price to sales, margins, revenue growth, return on equity, free-cash-flow yield.
- Companies tag the same line differently, so each line tries a list of XBRL tags. Only US-dollar figures are used: Spotify (euros) has none. Exxon's ticker now belongs to a new holding company with no reports yet, so its predecessor's filings are used until there are.
- The facts files are several megabytes each, so the parsed numbers are stored (`company_facts`, `lib/fundamentals.ts`). The daily job refreshes about 30 a run, so each company about weekly. A stock with nothing stored is fetched on its page and cached for a day.
- Shown in the stock page's "Company numbers" card. On the public site the valuation ratios use the simulated price, and the card says so.

**Screener (`/screener`)**
- Every catalog stock with momentum 12-1, volatility, beta, RSI, distance from its high, yield, market cap and P/E (`lib/analytics/screener.ts`).
- A "Company numbers" column view adds P/S, revenue growth, net margin, ROE and free-cash-flow yield. P/E comes from reported earnings when there are any. Figures more than 15 months old are left out.
- Filtering and sorting happen in the browser, so they're instant.
- Presets: momentum leaders, low volatility, oversold in an uptrend, dividend payers, defensive, quality, value, growth.
- "Backtest today's top 5" opens buy-and-hold of today's results. They were picked with today's numbers, so it looks back with hindsight.

**Testing a screen over time (`/screener/history`)**
- "Test this screen over time" (shown with the Momentum leaders preset) answers: if I had run this screen at the start of every month, using only what was known then, which stocks would I have owned, and how would they have done?
- The analytics service does the work (`services/analytics/analytics/screens.py`). Next.js validates the settings and the visitor, and sends the catalog as the candidates (`lib/screen-actions.ts`, `lib/analytics/history.ts`).
- **The schedule:** a selection on the first measured trading day, then on the first trading day of every month (the market index's days, so weekends and holidays are skipped).
- **Data used:** each selection uses closes through the previous session only, and trades at that day's close with the usual commission and slippage. The ranking function is only ever given closes before the decision day.
- **The rules** are the Screener's Momentum leaders, with the stock profiles' definitions:
  - 12-1 momentum = close[-22] ÷ close[-253] − 1, in the stock's own closes, where close[-1] is the previous session's: the return from 252 to 21 trading days back;
  - the 200-day average is the mean of the last 200 closes, the latest included, and "above" is strictly above;
  - percentiles are taken among every stock that could be ranked that day, ties sharing the average rank;
  - a stock qualifies at the 80th percentile or higher *and* above its average.
- **The portfolio:**
  - up to five qualifiers, highest momentum first, ties broken alphabetically;
  - 20% each, with empty slots in cash;
  - every pick is reset to 20% each month.
- **Missing prices are never filled in:**
  - a stock without a close on the previous session isn't ranked;
  - a pick without a price on the trading day isn't bought, and its slot stays in cash;
  - a stock due to be sold without a price is sold on its next day with one;
  - a held stock is valued at its latest close.
- **Warm-up:** about 13 months of earlier prices are loaded. If no stock can be ranked on the start date, results begin on the first day one can, and a warning says so.
- **Results:** value against the S&P 500 over the same days, with the benchmark's dividend treatment stated (the mock index excludes dividends). Also return, drawdown, Sharpe, turnover (value sold per year ÷ average value), trading costs, and a month-by-month history: the date and the data date, picks with their rank, momentum and a sentence of reasoning, entries and exits, trades and costs, cash left, and every candidate's numbers.
- **Saving:** saved like backtests, in `backtest_run` with `kind = 'historical-screen'`, and they count towards the same 50-run limit. The snapshot holds every candidate's closes on every day, whether picked or not (about 1 MB), so reproducing a run recalculates it from those saved prices, never fresh ones.
- **Limitations, shown with the results:**
  - the prices are simulated on the public site;
  - the candidates are today's catalog, so delisted companies are missing (survivorship bias);
  - only prices are used.

**Portfolio: Risk analysis** (`app/api/portfolio/analysis`; holdings are read on the server)
- **Risk:** volatility, beta, VaR, the diversification ratio, each holding's share of the risk, a correlation heatmap and sector exposure.
- **Stress tests:** the market's worst falls in the data, replayed on today's weights, plus beta-scaled hypothetical shocks.
- **Projection:** a 10-year Monte Carlo of 2,000 paths from month-long blocks of the portfolio's own daily returns.
- **Goal planner** (under the projection; `app/api/portfolio/plan`, `services/analytics/analytics/plan.py`): the same simulated futures, with money added or taken out at each month's end, over 1 to 40 years, with an optional target and inflation (2.5% a year: monthly amounts rise with prices, and results are in today's dollars). It shows the chance of reaching the target, the middle and bad-case (1 in 10) outcomes, and for withdrawals, the chance the money runs out and when.
- **Optimise:** least-risk, best-Sharpe and risk-parity weightings of the same stocks, and the efficient frontier. These come from SciPy, long-only, with shrunk estimates.

**Factor analysis: "What drives it"** (stock pages' Risk & technicals tab; the portfolio's Risk tab; `services/analytics/analytics/factors.py`)
- Five factors, each a daily return series built from MarketLab's own universe, the same way on simulated and real prices:
  - **Market:** the S&P 500's return;
  - **Size:** small companies minus big ones, by market value;
  - **Value:** cheap minus expensive, by earnings yield (from the price store's P/E, or the SEC numbers);
  - **Momentum:** 12-1 month winners minus losers, re-sorted monthly from the prices known then;
  - **Low volatility:** the calmest minus the jumpiest by past-year volatility, re-sorted monthly.
- Each long-short factor holds the top and bottom 30%, equally weighted. Size and value sort on today's market values and earnings, so their groups don't change over time: fine for describing exposures, not for testing a strategy.
- Exposures: an ordinary least-squares regression (statsmodels, with heteroskedasticity-robust standard errors) of the last 252 daily returns on the five factors. The card shows each beta (faint when it's within two standard errors of zero), R², annualised alpha, and a sentence in plain words. A portfolio's are calculated at today's weights.
- The factors and every stock's exposures are rebuilt nightly, and only when a stored price has changed (`analytics_result`, kinds `factor-returns` and `stock-factors`).

**Options lab (`/options`)** (`services/analytics/analytics/options.py`; learning only, with no option trading)
- A **simulated** chain for each stock: European options at 17 strikes around today's price and the next six monthly expiries (third Fridays), priced with Black-Scholes-Merton from the stock's own past-year volatility, a 4% risk-free rate and its dividend yield. Real chains differ: a volatility smile, early exercise, bid-ask spreads.
- The Greeks for any option in the chain, explained in words (delta, gamma, theta per day, vega and rho per percentage point).
- A strategy builder (buy a call or put, covered call, protective put, bull call spread, straddle) drawing profit at expiry, with breakevens, the most it can make and lose (or "Unlimited"), and the net premium.
- A calculator for any inputs, and an implied-volatility solver (Brent's method on the Black-Scholes price).

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
- **Sweeps:** a sweep reports the deflated Sharpe ratio of its best cell (`services/analytics/analytics/overfitting.py`): how likely it is to be real, given how many settings were tried.
- **Walk-forward test:** a crossover sweep over both averages offers one. It picks the best pair on each past window, tests it on the next unseen one, and compares the result with fixed settings and with buy and hold.

**How a run works.** The browser sends only the settings. The server (`lib/backtest/server.ts`):
1. checks them and the per-visitor rate limit;
2. loads the prices;
3. runs the engine.

Results are cached by the settings, the dataset's checksum and the engine's version.

**One engine.** Every backtest and sweep runs on the Python analytics service ([`services/analytics`](../services/analytics/README.md)). Every result names the engine and its version, and a failure shows an error; there's no other engine to fall back to. Until Phase 16 there was a TypeScript engine too, kept identical to the Python one. Its exact results on 23 fixed cases are now the Python engine's golden tests (`services/analytics/tests/test_golden.py`), and runs saved with it still open and are reproduced by the Python engine, which reports any difference.

**Timing rule.** For each trading session D, the engine:
1. decides from closes through the previous session (D−1);
2. fills the orders at D's close;
3. values the portfolio at D's close.

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

**Machine-learning sandbox** (the Backtest page's Machine learning tab; `services/analytics/analytics/ml.py`). Pick up to five stocks, features (recent returns, RSI, the MACD histogram, gaps to the 50- and 200-day averages, volatility, volume) and a model (logistic regression, random forest or gradient boosting, from scikit-learn). It predicts whether each stock rises over the next five sessions:
- trained walk-forward only: train on the past one to three years, predict the next three months, slide forward; the five sessions before each test window are left out of training, as their labels overlap it;
- trades on it every five sessions (equal weights in the stocks predicted to rise, cash otherwise), after trading costs;
- compared with the same model trained on shuffled labels three times (pure luck), always guessing the most common answer, and buying and holding; the deflated Sharpe ratio of its returns over buy and hold says how likely it is to really beat holding.

Runs are seeded, and saved runs keep the exact prices they used, so they can be reproduced like backtests (saved with `kind = 'ml'`).

**Settings versions:** settings carry a `version`. Older settings are upgraded when read; newer ones are refused rather than misread.

Rules that use a chandelier stop or volume need each day's high, low and volume. Only those runs load them, and their snapshots keep them, so every other snapshot is unchanged.

**Python engine 1.2.0** added the strategies above (all bit-identical with the former TypeScript engine on the golden cases). **Engine 1.1.0 fix.** It fixes a bug in both engines: selling out could leave a sliver of a share that still counted as held. Crossover and rule strategies then never bought that stock again, and exposure was overstated. Runs saved under 1.0.0 may differ when reproduced.

## The daily job

`/api/cron/daily` (`lib/maintenance.ts`) runs on weekdays at 21:30 UTC, after the New York close. It:
- loads fresh market data;
- catches up every account, in batches of about 50 seconds (fills, dividends and splits, price alerts);
- stores the latest prices, then has the analytics service run its nightly parts (`POST /v1/jobs/nightly`, called again while it has work left, within a slot that leaves time for the rest):
  1. **indicator alerts** (RSI, average crosses, big moves, 52-week highs and lows), on closes adjusted for splits only, triggered at the first close since they were made;
  2. **portfolio snapshots:** each portfolio's value at the close, into `portfolio_value`, backfilled once from each account's trades; the Performance tab uses them for past closes, so the record stays exact after old trades drop off an account;
  3. **stock profiles** (see [Research tools](#research-tools));
  4. **factors:** the factor returns and every stock's exposures;
- sends alert emails and push notifications, including alerts the nightly parts just triggered (see [Email](#email) and [Installing and push notifications](#installing-and-push-notifications));
- runs the monthly competitions (see [Competitions and badges](#competitions-and-badges));
- refreshes company numbers that are a week old, for up to 10 seconds;
- deletes guests unused for 180 days, old rate-limit counters, and snapshots no saved run uses.

Every nightly part skips what hasn't changed and is safe to run twice, so a run that stops early is continued by the next. `/api/health` reports each part's outcome from the last run.

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

## Installing and push notifications

**Installing:** `app/manifest.ts` and the icons in `public/icons/` (drawn by `scripts/make-icons.mjs`) let browsers install MarketLab with its own icon and window: Chrome and Edge from the address bar, Safari with Add to Home Screen. Nothing works offline: a stale market page would mislead.

**Push notifications** (`lib/push.ts`, `lib/alert-pushes.ts`, `public/sw.js`)
- **Opt-in, per device:** "Get alerts on this device" under the alerts on the watchlist page. Permission is asked on that click, never unprompted. Guests can turn it on too; their devices move to their account when they sign in. Signing out turns it off for that browser, so the next person on a shared computer doesn't get the account's alerts.
- **Sending:** after catching up accounts, the daily job pushes each newly triggered alert to every device its owner turned on, at most once (`price_alert.pushed_at`), skipping alerts already seen in the app or more than 2 days old. Up to three alerts get a notification each; more are summed up in one. A click opens the stock (or the alerts).
- **How:** the browser's push service (Google's for Chrome and Edge, Mozilla's, Apple's) delivers them. Each message is signed with this site's VAPID key pair and encrypted for that one browser, so the push service can't read it. Devices it reports as gone are forgotten.
- **Safety:** the server sends requests to each device's endpoint, so only the known push services' https addresses are accepted, and anyone can have at most 10 devices.
- **iPhone and iPad:** Safari delivers push only to the home-screen app (iOS 16.4 or later), so the panel explains that step there.
- **Without the key pair** (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`), push is off and the panel offers notifications only while MarketLab is open.

## Phones and accessibility

**Layout on phones** (below 768px)
- **Navigation:** a tab bar along the bottom (`components/layout/tab-bar.tsx`) with Dashboard, Stocks, Portfolio, Learn and More. More opens a sheet with the other pages. The header is one row. Both pad themselves by the safe area (the notch and home bar), which matters in the installed app (`viewportFit: "cover"`).
- **Long pages:** the stock and portfolio pages have a sticky row of section chips (`components/ui/section-nav.tsx`). The stock page's order is the price, then trading, then the analysis.
- **Screener:** the filters open in a sheet, and the results are rows showing one number, chosen with "Sort by".
- **Backtests and screens over time:** a finished run scrolls its results into view and moves focus to them (`components/ui/reveal.ts`).
- **Dashboard:** the index cards swipe sideways.

**Accessibility rules**
- **Contrast:** every text colour is at least 4.5:1 against the page, cards, grey fills and its own tint, in all seven themes. `lib/theme-contrast.test.ts` reads the tokens in `app/globals.css` and checks them. Filled buttons use `--accent-fill` and `--loss-fill`, which are deeper than the text colours in dark mode, so white text on them passes too.
- **Tap targets:** at least 24×24px (WCAG 2.2). Small controls in tight rows use the `tap` utility, which adds an invisible 44px-tall tap area.
- **Text:** nothing under 12px. On phones, form fields use 16px text, so iPhone Safari doesn't zoom in when one is tapped.
- **Zooming** is never blocked.

**Checks:** the "phone" Playwright project (`e2e/mobile.spec.ts`) opens every main page at iPhone size in light and dark. On each, it runs axe (WCAG 2.2 AA; serious or critical problems fail) and checks for sideways scrolling, small tap targets and small text. It also tests the tab bar, the screener sheet, the backtest reveal and the section chips.

## Competitions and badges

**Seasons** (`lib/seasons.ts` rules, `lib/db/seasons.ts` storage)
- **The calendar:** each calendar month (UTC) is a season, named like `2026-11`.
- **Joining:** signed-in users can join during its first 7 days, under a display name. Each entrant gets a separate portfolio with $100,000 in cash.
- **Ranking:** everyone starts with the same money, so the highest value wins; a tie goes to whoever joined first.
- **Rules:** no resets, one entry each, and the same market and trading rules as everywhere else.

**Season portfolios** (`lib/books.ts`)
- **How it's stored:** a season portfolio is a hidden user row (`user.season_of` = its owner), the same trick guests use. So trading, orders, dividends and the daily catch-up work on it unchanged.
- **Switching:** the person stays `currentOwner` for everything else (saved runs, lessons, notifications, the all-time board). Only trading and the portfolio views follow the chosen "book", which is held in the `marketlab_book` cookie. The cookie is honoured only for a season entry the signed-in user owns.
- **What stays personal:** a season book is shown with the owner's own watchlist and alerts.
- **After the season:** a finished season's portfolio is read-only, and the daily job stops processing it.

**The daily job** (`lib/season-job.ts`), after accounts are caught up:
- opens this month's season;
- records every entry's value at the close (`season_standing`, for the race chart);
- once the latest close is in a later month, freezes the final values and ranks at each entry's last recorded value, and awards the season badges.

**Notifications:** push notifications, to devices people turned on: the new season to last season's players, a "3 days left" reminder with your place, and the final result. The final result also goes by email to players with alert emails on. Each kind goes out once per season.

**Pages**
- `/leaderboard` has three tabs: This season (`/leaderboard/season`, which redirects to this month), Past seasons (`/leaderboard/seasons`) and All time.
- A season's page shows your entry (join, your place, sharing), the race (the top ten and you) and the standings. Its board is cached for minutes and refreshed when someone joins or the job records a close.
- Each player has a page to share (`/leaderboard/season/[id]/[name]`), with a generated preview image (`opengraph-image.tsx`). It's read fresh, since it's opened right after joining.
- `proxy.ts` gives months that don't exist, or haven't started, a real 404.

**Badges** (`lib/badges.ts`)
- **Lessons:** first, ten, and all of them.
- **Streaks:** a lesson passed or a trade on 7 days in a row.
- **Seasons:** finished; top 10% (with 10 or more players); podium (3 or more); winner (2 or more).
- **Storage:** badges are kept once earned (`badge`).
- **When they're checked:** lesson and streak badges are checked after a pass or a trade, and whenever the badges are shown (`lib/badge-check.ts`). Season badges are checked when the season closes.
- **Where they show:** next to display names on both boards, and on the portfolio page's Competitions card.

**Testing:** `SEASON_JOIN_ANY_DAY=1` lets the end-to-end tests join on any day of the month. Never set it on a real deployment.

