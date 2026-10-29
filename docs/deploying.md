# Deploying

One Vercel project (Vercel Services, `vercel.json`) with two services, `web` (Next.js) and `analytics` (Python), plus Turso. Pushes to `main` go to production.

## Migrations

Apply to both `marketlab-prod` and `marketlab-preview` before pushing code that needs them:

```bash
DATABASE_URL=libsql://… DATABASE_AUTH_TOKEN=… npm run db:migrate
```

## Environment variables

| Variable | |
|---|---|
| `BETTER_AUTH_SECRET` | Random, per environment |
| `BETTER_AUTH_URL`, `BETTER_AUTH_ALLOWED_HOSTS` | The site's host |
| `DATABASE_URL`, `DATABASE_AUTH_TOKEN` | Turso |
| `ANALYTICS_SERVICE_TOKEN` | Random, per environment |
| `CRON_SECRET` | Production only |
| `SEC_USER_AGENT` | Optional: SEC filings |
| `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | Optional: email |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Optional: push |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional: Google sign-in |
| `TIINGO_API_KEY` | Never on a public deployment |

## Google sign-in

Create a web OAuth client in Google Cloud Console with the redirect URI `https://<host>/api/auth/callback/google` (and the localhost one), then set the two variables.

## Monitoring

- `/api/health` checks every dependency.
- An hourly GitHub Action opens an issue while it fails.

## Recovery

- Bad deploy: Vercel → Instant Rollback.
- Data: `turso db create <name> --from-db marketlab-prod --timestamp <time>`
