# MarketLab

A stock dashboard, portfolio simulator and strategy backtester, built with Next.js 16, React 19 and Tailwind CSS 4.

- **Dashboard, stocks table, stock pages and ⌘K search**, all pre-rendered and refreshed about once an hour. Ten featured stocks fill the dashboard; about 85 more well-known US stocks can be searched, opened, watched, traded and backtested. With real prices (Tiingo), any other ticker works too.
- **Watchlist and simulated trading.** Everything is saved in the database, with or without an account. Without one you're a *guest*, kept for your browser by a cookie; with one it follows you between devices. Signing in brings your guest portfolio, backtests and lesson progress into your account (see [Accounts and guests](#accounts-and-guests)).
- **Realistic trading.** Market, limit and stop orders (filled at a daily close), dividends paid into your cash, and stock splits (with cash for any fraction of a share). Start over with a starter portfolio or cash only ($10k, $25k or $100k).
- **Price alerts.** "Tell me when KO closes above $70", with a badge in the header and, if you turn them on, browser notifications while the site is open. A daily job checks every alert at the close, whether or not you visit.
- **Filings and news.** Each stock page lists the company's real recent SEC filings (earnings, annual reports, leadership changes). With your own Tiingo key, it also shows news headlines.
- **Learn as you go.** An ⓘ next to measures and terms (Sharpe ratio, drawdown, RSI, limit orders, P/E…) explains them in plain English, with a link to a full lesson. `/learn` has 29 short lessons (3–5 minutes each, in a suggested order) on investing basics, measuring results, orders, company numbers, indicators and strategies. Each has a worked example, an interactive demo for most, links into the app (strategy lessons open a ready-made backtest), and an optional short test; passing it ticks the lesson off. Quiz answers, best scores and passes are saved in the database as you answer, so a reload picks up where you left off: with your account when signed in (on every device), or with your guest for that browser, merged into your account when you sign in (see [Lesson progress](#lesson-progress)).
- **Share and compare.** "Copy link" on a backtest makes a link that opens the same backtest for anyone (the settings travel in the link, nothing is stored). Signed-in users can join the opt-in leaderboard under a display name, ranked by their return since joining.
- **Portfolio analytics.** Your portfolio's value over time, rebuilt from your trades, as growth of $100 against the S&P 500, Nasdaq or Dow, with return, drawdown, volatility and Sharpe ratio; a breakdown by sector; and your trades as a CSV file.
- **Backtesting.** Try buy and hold, a moving-average crossover, dollar-cost averaging, rebalancing, or your own rules (RSI, moving averages, crossovers) on up to five stocks over five years of daily prices, with trading costs, compared with a benchmark. See returns month by month, test a range of settings at once (a parameter sweep), save runs and compare up to four. Backtests run on the server, next to the prices, and results are cached, so a shared link opens instantly.

## Market data

Prices come from one of two sources:

- **The mock market (default).** Generated from fixed seeds: five years of daily prices that keep moving forward one trading day at a time with the real calendar. No account or key needed. Each stock (and index) starts from its *real* price and market cap around Oct 16, 2026, and pays dividends at roughly its real yield (`lib/market/anchors.ts`, read from public lists that day); only that starting point is real, the path before and every move after are simulated.
- **Tiingo (real end-of-day prices).** Used when `TIINGO_API_KEY` is set. Get a free key at [tiingo.com](https://www.tiingo.com). The free plan allows 50 requests an hour and 1,000 a day. The dashboard's 13 symbols cost one request each per hourly refresh. Any other stock costs one request an hour while someone looks at it, plus one (cached for a week) to look up a ticker that isn't in the catalog. A request budget (`lib/market/budget.ts`) stops extra tickers before they could crowd out the dashboard.

> **Licensing:** Tiingo's free plan is for **personal use only**: its terms forbid showing the data to anyone else. Use your key on your own machine or a private deployment. A public deployment must leave `TIINGO_API_KEY` unset, so it uses the mock market. As a safety net, on Vercel the key is ignored (with a warning in the logs) unless `MARKET_DATA_PRIVATE=1` is also set.

### Chart colors and ranges

Every price chart, big or small, shows the same range: pick 1D, 1W, 1M, 6M, 1Y or 5Y on the dashboard, a stock page, the stocks table or the watchlist, and they all follow (remembered in your browser). A line is green if it ended that range higher than it started and red if lower, and small lines show that change beside them ("1M +4.2%"), next to today's change.

With the mock market, the 1D, 1W and 1M charts show prices every 5 minutes through each trading day (9:30 AM to 4 PM New York time), so hovering moves through the day instead of jumping from close to close. They're built from each day's open, high, low and close (`lib/market/intraday.ts`): every day's path starts at its open, ends exactly at its close and reaches exactly its high and low, and is the same on every visit. Real data (Tiingo's end-of-day prices) has no intraday prices and none are made up for real stocks, so with a Tiingo key those charts stay daily. 6M and longer are always daily.

### How orders, dividends and alerts work

Prices are end-of-day, so everything waiting for a price is checked once a day, at the close:

- **Limit orders** buy at a close at or below your price, or sell at a close at or above it. **Stop orders** sell once a close falls to your level (or buy once it rises to it). They fill *at that close*: possibly better than a limit, or, after a jump, much worse than a stop. An order lasts until the next close, or up to 90 days. Cash and shares are checked when it fills, not set aside.
- **Dividends and splits** apply on their ex-date to the shares you held at the previous close. A split's fraction of a share is paid out in cash. The mock market's dividends and splits start on Oct 19, 2026, so the five years before stay as they were.
- **Alerts** trigger on the first close past their level.

All of this happens on the server: a daily job after the close (see [The daily job](#the-daily-job)) catches every account up, and so does opening the site or trading, in case the job hasn't run yet. It's one shared function (`lib/processing.ts`), safe to run twice: nothing is paid or filled twice.

### Filings and news

- **SEC filings** come from the SEC's free EDGAR API. They're public records, so they're shown on the public site too. Set `SEC_USER_AGENT` (a name and a contact email; the SEC requires it) to turn them on. Lookups are cached for hours, far below the SEC's 10-requests-a-second limit.
- **News headlines** come from Tiingo, only with your own key (personal use), and are hidden if your plan doesn't include news.

### Which stocks exist

- **Core:** the 10 stocks and 3 indices in `lib/market/universe.ts`, on the dashboard and in the stocks table. Their pages are built at `npm run build`.
- **Catalog:** about 95 stocks in `lib/market/catalog.ts`, names and sectors typed by hand. Their pages are built on the first visit and then stored. With mock data, these are the whole market: any other `/stocks/…` URL is a 404.
- **Any ticker (Tiingo only):** search shows "Open this ticker" for a symbol that isn't listed; its page says "not found" if Tiingo doesn't know it.

Saved accounts and backtests only check that a symbol is *well-formed* when they're read, so a stock missing from today's data (say, after switching from Tiingo back to mock) never wipes them; it just shows "—". The server checks a stock really exists when you add it. Accounts can hold and watch up to 30 stocks each.

If Tiingo can't be reached (wrong key, request limit, network), the dashboard shows the mock market with a notice and tries again a minute later. Other stocks never fall back to made-up prices: their pages say the prices are unavailable and retry a minute later. `MARKET_DATA_SOURCE=mock` forces the mock market even when a key is set. Tiingo's end-of-day data has no market cap or P/E, so those show "—" with real prices.

### Lesson progress

Quiz answers (including half-finished quizzes), best scores and passed lessons are saved in the database for everyone:

- **Signed in:** with your account, so they follow you to any device.
- **Guests:** with their guest (see [Accounts and guests](#accounts-and-guests)), created the first time they answer a question, so visitors who only read lessons create nothing.
- **Signing in** merges the guest's progress into the account (best score and earliest pass kept, the most recent answers kept).

Answers go through Server Actions (`lib/learn-actions.ts`) that send only which choice was picked; the server marks them right or wrong against the lesson's answer key, so a request can't claim a pass. The tables are `learner` and `lesson_progress` (migration 0004). Lessons passed in the browser-only version before this are brought into the database once, then removed from the browser; so is progress kept under Phase 10's own `marketlab_learner` cookie, which is folded into the guest.

### Accounts and guests

Every account lives in the database (`lib/db/`). A *guest* is a row in the `user` table marked `is_guest` (migration 0005), with a placeholder email that can't receive mail and no password or session: guests are never "signed in". A browser is tied to its guest by an httpOnly cookie (`marketlab_guest`, 400 days, a random ID only), created on the first change worth saving: a trade, a watched stock, an alert, a saved backtest or a quiz answer. Visitors who only look around create nothing.

`lib/owner.ts` works out whose data a request is about, for every Server Action and route: the signed-in user, or the guest in the cookie. So the same code serves both, and every account is caught up by the same server-side function.

When a guest signs in, `lib/db/guests.ts` hands their data over in one transaction: lesson progress and saved backtests are merged in; the portfolio moves over if the account has none (or the guest's is the untouched starting one); and if both have a portfolio of their own, the user is asked which to keep. The guest is then deleted. Accounts and saved backtests that browsers kept in localStorage before this are imported once, then removed.

### The daily job

`/api/cron/daily` (`lib/maintenance.ts`) runs on weekdays at 21:30 UTC, after the 4 PM New York close in summer and winter (`vercel.json`; Vercel's Hobby plan runs it some time within that hour). It loads fresh market data, then catches up every account that's behind, in batches within about 50 seconds (what doesn't fit waits for the next run, or the owner's next visit), and deletes guests unused for 180 days, old Phase 10 learners and old rate-limit counters. Only Vercel can run it: it sends the `CRON_SECRET` environment variable as a bearer token, and every other request is refused (all of them, if no secret is set). To run it locally: `CRON_SECRET=test npm run dev`, then `curl -H 'authorization: Bearer test' localhost:3000/api/cron/daily`.

Email alerts are a natural next step, but need verified email addresses (sign-up doesn't verify them yet) and an email service.

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
| `npm run check`       | Lint, test and build: run before deploying                      |
| `npm run db:generate` | Write a new migration in `drizzle/` after changing `lib/db/schema.ts` |
| `npm run db:migrate`  | Apply migrations to the database in `DATABASE_URL`              |

## Deploying

MarketLab runs on [Vercel](https://vercel.com) with a [Turso](https://turso.tech) database. Turso is hosted SQLite, so the same code and migrations work locally and online. The public site runs on the mock market.

1. **Check the code** locally: `npm run check`.
2. **Create two Turso databases**, `marketlab-prod` and `marketlab-preview`, in the region closest to Vercel's default (`aws-us-east-1`, near Vercel's `iad1`). For each, get its URL (`turso db show --url <name>`) and a token (`turso db tokens create <name>`).
3. **Apply the migrations to both** from your machine:
   ```bash
   DATABASE_URL=libsql://… DATABASE_AUTH_TOKEN=… npm run db:migrate
   ```
   In later phases, apply new migrations *before* deploying code that needs them.
4. **Import the GitHub repo into Vercel** (it detects Next.js). From then on, every push to `main` deploys to production and every other branch gets a preview URL. Keep Deployment Protection on for previews.
5. **Set the environment variables** (Project → Settings → Environment Variables), separately for Production and Preview:

   | Variable | Production | Preview |
   | --- | --- | --- |
   | `BETTER_AUTH_SECRET` | a new value (`openssl rand -base64 32`) | another new value |
   | `BETTER_AUTH_URL` | `https://<your production host>` | the same (used as a fallback) |
   | `BETTER_AUTH_ALLOWED_HOSTS` | `<production host>` | `<production host>,marketlab-*-<your team>.vercel.app` |
   | `DATABASE_URL`, `DATABASE_AUTH_TOKEN` | the prod database | the preview database |
   | `TIINGO_API_KEY` | **not set** | **not set** |
   | `MARKET_DATA_SOURCE` | optionally `mock`, as a second safety | the same |
   | `SEC_USER_AGENT` | `MarketLab <contact email>`, to show SEC filings | the same |
   | `CRON_SECRET` | a new random value (`openssl rand -base64 32`): lets Vercel Cron run the daily job | not needed (Vercel Cron only runs on production) |

6. **Deploy, then test the preview** before production:
   - `/`, `/stocks`, `/stocks/AAPL`; `/stocks/KO` (a skeleton on the first visit, instant after); `/stocks/ZZZZ` gives 404; `/stocks/aapl` redirects.
   - The "Mock data" label and the footer's "Simulated prices" note show.
   - As a guest: watch and buy KO, reload, and it's all still there (and nothing is in the browser's localStorage).
   - Sign up on the preview URL: the guest portfolio is already in the account. Trade, then open it in another browser and sign in.
   - The 6th wrong password within a minute is refused.
   - Backtest KO + AAPL, save it, compare it.
   - Vercel's function logs show no errors, and the preview database has rows (`turso db shell marketlab-preview "select count(*) from user"`).
7. **Production:** merge to `main`, run the same checks against the production URL, and delete the test account. To undo a bad deploy, use Vercel → Deployments → Instant Rollback.

Better Auth refuses to start in production without a real secret, so a missing variable shows up as an error, not as a quietly insecure site.

If you self-host on more than one server instance (not needed on Vercel), also set `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` to the same value on every instance, so Server Actions work whichever instance answers.

## Where things live

- `app/`: pages and API routes (`/api/auth/*` for sign-in, `/api/account` for loading your account, `/api/quotes` for prices of held or watched stocks outside the core, `/api/backtests` for saved runs, `/api/portfolio/performance` for the portfolio's performance, `/api/learn-progress` for lesson progress, `/api/cron/daily` for the daily job).
- `components/`: UI. `components/account/account-provider.tsx` loads the account (signed in or a guest) and runs every change through Server Actions, showing it at once (optimistically) until the server confirms.
- `lib/trading.ts`: the trading rules. The server applies them to every account; the browser uses them only to show a change at once.
- `lib/account-actions.ts`: Server Actions for every account. They get the owner from the session or guest cookie (`lib/owner.ts`) and validate every input.
- `lib/market/`: market data. `provider.ts` is the interface; `mock.ts` and `tiingo.ts` implement it; `mode.ts` picks one; `index.ts` caches the core market for an hour, and every other stock on its own. `catalog.ts` lists the stocks beyond the core, and `symbols.ts` says what a valid ticker looks like.
- `lib/backtest/`: the backtesting engine (`engine.ts`), the strategies, custom rules (`rules.ts`), run settings (`config.ts`), monthly returns (`periods.ts`) and parameter sweeps (`sweep.ts`). Pure functions, run on the server by `server.ts` (cached by settings) through the Server Actions in `lib/backtest-actions.ts`, which validate the settings and rate-limit each visitor (`lib/rate-limit.ts`).
- `lib/portfolio-history.ts`, `lib/portfolio-performance.ts`: rebuild the portfolio's past values by undoing its trades, dividends and splits, newest first, and measure them against an index (on the server, for `/api/portfolio/performance`).
- `lib/orders.ts`, `lib/alerts.ts`, `lib/processing.ts`: limit and stop orders, price alerts, and catching an account up with the market.
- `lib/market/filings.ts`: SEC filings; `lib/market/tiingo.ts` also has Tiingo news.
- `lib/glossary.ts`: every explained term (the ⓘ popovers, `/learn` and each lesson's opening), in learning-path order.
- `lib/lessons/`: the lessons at `/learn/<slug>`. `content/` holds the text, one file per group, with tests that recompute every worked example; `slugs.ts` the addresses (proxy.ts 404s any other); `demos.ts` the math behind the interactive demos (`components/learn/demos/`), which uses arithmetic only so the server and browser draw identical charts; `progress.ts` the rules for answers, scores, passes and merging a guest's progress into an account. `lessons.test.ts` holds every lesson to the format: 3–5 minutes, every part filled in, a quiz covering terminology, use and the real world, and only valid links.
- `lib/backtest/share.ts`: backtest share links (`/backtest#run=…`).
- `lib/leaderboard.ts`, `lib/leaderboard-data.ts`, `lib/leaderboard-actions.ts`: display-name rules and standings, the cached public standings, and joining or leaving.

### Saved backtests and versions

A saved run stores its settings as JSON. Settings carry a `version` (now 2: custom rules were added). Older settings are upgraded when they're read, and settings from a newer version are refused rather than misread, so adding a strategy never needs a database migration. (`lib/backtest/saved-local.ts` only reads the list of runs browsers kept in localStorage before saved runs moved to the database, to import them once.)
- `lib/db/`: the database schema (Drizzle), and the code that reads and writes accounts, saved backtests, the leaderboard and lesson progress (`learning.ts`).
- `lib/owner.ts`: whose data a request is about (signed-in user or guest cookie), and the handover when a guest signs in. `lib/db/guests.ts` holds the guest rules.
- `lib/learn-actions.ts`, `app/api/learn-progress`: saving answers and loading lesson progress.
- `lib/maintenance.ts`, `app/api/cron/daily`, `vercel.json`: the daily job.
- `lib/auth.ts`: Better Auth configuration (email and password sign-in, rate limits).
