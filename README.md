# MarketLab

A stock dashboard and portfolio simulator, built with Next.js 16, React 19 and Tailwind CSS 4. Market data is mock data, generated from fixed seeds, frozen at Oct 16, 2026.

- **Dashboard, stocks table, stock pages and ⌘K search**, all pre-rendered.
- **Watchlist and simulated trading.** Without an account, everything is saved in your browser (guest mode). With an account, it's saved in a database and follows you between devices. On your first sign-in you can import your guest data.

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

## Scripts

| Command               | What it does                                                    |
| --------------------- | --------------------------------------------------------------- |
| `npm run dev`         | Development server                                              |
| `npm run build`       | Production build (also type-checks)                             |
| `npm start`           | Serve the production build                                      |
| `npm test`            | Unit tests (Vitest)                                             |
| `npm run lint`        | ESLint                                                          |
| `npm run db:generate` | Write a new migration in `drizzle/` after changing `lib/db/schema.ts` |
| `npm run db:migrate`  | Apply migrations to the database in `DATABASE_URL`              |

## Deploying

The app needs a database the server can reach. Locally that's a SQLite file. Online, use [Turso](https://turso.tech), a hosted database that speaks the same SQLite dialect, so the same code and migrations work on both.

1. **Create a Turso database** and get its URL (`libsql://…`) and an auth token.
2. **Apply the migrations to it** from your machine:
   ```bash
   DATABASE_URL=libsql://… DATABASE_AUTH_TOKEN=… npm run db:migrate
   ```
   Do this again whenever a new migration is added.
3. **Set these environment variables on your host** (on Vercel: Project → Settings → Environment Variables):
   - `BETTER_AUTH_SECRET`: a **new** random value, not your local one.
   - `BETTER_AUTH_URL`: the site's public URL, e.g. `https://marketlab.example.com`.
   - `DATABASE_URL` and `DATABASE_AUTH_TOKEN`: from step 1.
4. **Deploy.** Better Auth refuses to start in production without a real secret, so a missing variable shows up as an error, not as a quietly insecure site.

If you self-host on more than one server instance (not needed on Vercel), also set `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` to the same value on every instance, so Server Actions work whichever instance answers.

## Where things live

- `app/`: pages and API routes (`/api/auth/*` for sign-in, `/api/account` for loading your account).
- `components/`: UI. `components/account/account-provider.tsx` decides whether the account lives in the browser or the database.
- `lib/trading.ts`: the trading rules. The browser (guest mode) and the server (signed in) both use them.
- `lib/account-actions.ts`: Server Actions for signed-in users. They check the session and validate every input.
- `lib/db/`: the database schema (Drizzle), and the code that reads and writes accounts.
- `lib/auth.ts`: Better Auth configuration (email and password sign-in, rate limits).
