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
| `SEC_USER_AGENT` | `MarketLab <contact email>`, to show SEC filings. |
| `RESEND_API_KEY`, `EMAIL_FROM` | Optional. Without them, email verification is off. |
| `TIINGO_API_KEY` | **Never on a public deployment** (personal-use licence). |

Better Auth refuses to start in production without a real secret, so a missing secret shows up as an error rather than as an insecure site.

## Checking a deployment

- **Pages:** `/`, `/stocks/AAPL` and `/learn` load. `/stocks/ZZZZ` returns 404.
- **Guests:** as a guest, buy a stock and reload; it's still there.
- **Sign-up:** sign up and check that the guest portfolio moved into the account.
- **Backtests:** run one, save it, reopen it, and click "Reproduce from saved inputs". The result names the engine.
- **Cron:** `/api/cron/daily` answers 401 without the secret, and `vercel crons ls` lists the job.

## Monitoring

- **`/api/health`** reports the database, the analytics service, market data, the last daily job and how current the stored analytics are. It answers 503 when something users would notice is down.
- **The hourly uptime check** (`.github/workflows/uptime.yml`) reads it. While it fails, an issue labelled `uptime` stays open (GitHub emails you), and it's closed once the site is healthy again. Run it by hand from the Actions tab with "Run workflow".
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
