# Deploying

MarketLab runs on Vercel as one project, with a Turso database. [Vercel Services](https://vercel.com/docs/services) runs two parts side by side (`vercel.json`):

- **`web`**: the Next.js app, at the repository root. Every public path goes here.
- **`analytics`**: the Python service in `services/analytics/`. It's private, with no public route.
  - `web` reaches it through a binding, which sets `ANALYTICS_URL`.
  - Bindings don't authenticate calls, so the service also requires `ANALYTICS_SERVICE_TOKEN`.

The project's Framework setting is "Services". The daily cron job is defined in the same `vercel.json`.

Every push to `main` deploys to production. Every other branch gets a preview.

## Databases

There are two Turso databases, `marketlab-prod` and `marketlab-preview`. Apply new migrations to **both** before pushing code that needs them:

```bash
DATABASE_URL=libsql://… DATABASE_AUTH_TOKEN=… npm run db:migrate
```

Migrations only add tables and columns, so they're safe to apply ahead of the code.

Migration 0007 (Phase 12) adds:
- the price store (`daily_bar`, `price_series`);
- stored analytics (`analytics_result`);
- `price_alert.condition`, for indicator alerts.

The first daily job after deploying fills the store: about 130,000 rows for the mock market, a few seconds of work.

Migration 0014 adds the competitions: `season`, `season_entry`, `season_standing`, `badge`, and `user.season_of` (season portfolios are hidden user rows). Apply it before deploying code that reads them: the portfolio page and the daily job do.

Migration 0013 adds `push_subscription` (each device that gets push notifications) and `price_alert.pushed_at`. Apply it before deploying code that sends pushes: the daily job reads both.

Migration 0012 adds `backtest_run.kind` (`backtest` by default, or `historical-screen`), so saved historical screens share the saved-runs table and its limit. Apply it before deploying code that saves screens: the new code filters on the column.

Migration 0011 adds `company_facts`, the stored SEC company numbers. The daily job fills it about 30 companies a run. Without `SEC_USER_AGENT` it stays empty and the Company numbers card is hidden.

The Python service now includes SciPy. Its bundle is about 170 MB, within Vercel's 500 MB limit for Python functions.

## Environment variables

Set them in Project → Settings → Environment Variables, separately for Production and Preview.

| Variable | Value |
|---|---|
| `BETTER_AUTH_SECRET` | A different random value per environment (`openssl rand -base64 32`). |
| `BETTER_AUTH_URL` | `https://<production host>` |
| `BETTER_AUTH_ALLOWED_HOSTS` | Production: `<production host>`. Preview: also add `marketlab-*-<team>.vercel.app`. |
| `DATABASE_URL`, `DATABASE_AUTH_TOKEN` | That environment's Turso database. |
| `BACKTEST_ENGINE` | `python` or `typescript`. |
| `ANALYTICS_SERVICE_TOKEN` | A random value per environment. Don't set `ANALYTICS_URL`: the binding provides it. |
| `CRON_SECRET` | Production only: lets Vercel Cron run the daily job. |
| `SEC_USER_AGENT` | `MarketLab <contact email>`, to show SEC filings and company numbers. |
| `SMTP_USER`, `SMTP_PASS` | Optional: a Gmail address and a Google **app password** for it (Google Account → Security → 2-Step Verification → App passwords). Turns on email verification and alert emails. Without them, email is off. Gmail sends up to about 500 emails a day. |
| `EMAIL_FROM` | Optional: the sender name and address, e.g. `MarketLab <you@gmail.com>`. Defaults to `SMTP_USER`. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Optional: the key pair that signs push notifications, a different pair per environment. Make one with `npx web-push generate-vapid-keys`. Without them, push is off and the alerts panel offers notifications only while MarketLab is open. Changing the pair cuts off every subscribed device until it turns notifications on again. |
| `VAPID_SUBJECT` | Optional: an `https:` or `mailto:` contact for push services. Defaults to `BETTER_AUTH_URL` (or the GitHub repository when that isn't https). |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional: "Continue with Google" on the sign-in pages (see [Google sign-in](#google-sign-in)). Without them, the button is hidden. |
| `TIINGO_API_KEY` | **Never on a public deployment** (personal-use licence). |

Better Auth refuses to start in production without a real secret, so a missing secret shows up as an error rather than as an insecure site.

## Google sign-in

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project (or pick one).
2. **Google Auth Platform → Branding**: set the app name (MarketLab), a support email, and the site's home page. Audience: **External**. Scopes: the default `openid`, `email` and `profile` are all it needs.
3. **Clients → Create client → Web application**:
   - Authorised JavaScript origins: `http://localhost:3000` and `https://<production host>`.
   - Authorised redirect URIs: `http://localhost:3000/api/auth/callback/google` and `https://<production host>/api/auth/callback/google`.
4. Copy the client ID and secret into `.env.local` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, and into Vercel's Production environment. Restart `npm run dev`, or redeploy: the sign-in pages are built with the button on or off.
5. While the app is in **Testing**, only the test users listed under Audience can sign in; **Publish app** opens it to everyone (no Google review needed for these basic scopes).

Google only accepts exact redirect URIs, so sign-in with Google doesn't work on preview URLs, which change with every deploy (email and password still do). A Google sign-in whose email matches an existing account joins that account only if the account's email is verified; otherwise the sign-in page says to use the password.

## Checking a deployment

- **Pages:** `/`, `/stocks/AAPL` and `/learn` load. `/stocks/ZZZZ` returns 404.
- **Guests:** as a guest, buy a stock and reload; it's still there.
- **Sign-up:** sign up and check that the guest portfolio moved into the account.
- **Backtests:** run one, save it, reopen it, and click "Reproduce from saved inputs". The result names the engine.
- **Install and push:** `/manifest.webmanifest` lists the icons; on the watchlist page, turn on "Get alerts on this device" and click "Send a test".
- **Cron:** `/api/cron/daily` answers 401 without the secret, and `vercel crons ls` lists the job.

## Monitoring

- **`/api/health`** reports the database, the analytics service, market data, the last daily job and how current the stored analytics are. It answers 503 when something users would notice is down. The analytics service sleeps when idle, so it gets 15 seconds to wake up; everything else gets 5.
- **The hourly uptime check** (`.github/workflows/uptime.yml`) reads it, and tries once more 20 seconds later before counting a failure. While it fails, an issue labelled `uptime` stays open (GitHub emails you), and it's closed once the site is healthy again. Run it by hand from the Actions tab with "Run workflow".
- **Vercel Web Analytics and Speed Insights** are in the layout. Enable them once in the Vercel project's Analytics and Speed Insights tabs (free on Hobby).
- **CI** (`.github/workflows/ci.yml`) runs lint, every test, the build, the Python tests, a dependency audit and the Playwright end-to-end tests. Branch protection requires all of them on `main`.

## Backups and restoring

Turso keeps point-in-time history. To get the production database back as it was at a moment, restore it into a new database, check it, then point the app at it (or copy rows back):

```bash
turso db create marketlab-restored --from-db marketlab-prod --timestamp 2026-10-21T02:00:00Z
turso db shell marketlab-restored "select count(*) from user"
turso db tokens create marketlab-restored     # then set DATABASE_URL / DATABASE_AUTH_TOKEN on Vercel
```

**Drill, Oct 21, 2026:** production restored as of an hour earlier in about 5 seconds. Every table was present, and its row counts matched that moment: the migration and the portfolio created after it were absent, as expected. The copy was then deleted.

## Rolling back

- **A bad deploy:** Vercel → Deployments → Instant Rollback.
- **Turning the Python engine off without touching routing:** set `BACKTEST_ENGINE=typescript`.
