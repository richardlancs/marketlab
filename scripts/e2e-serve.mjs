// Starts MarketLab for the end-to-end tests (playwright.config.ts): a fresh
// e2e.db with every migration, the Python analytics service on :8010, and the
// production build of the Next.js app on :3010, wired together with test-only
// settings. Needs `npm run build` first. Stops both servers on exit.
import { spawn, spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import webpush from "web-push";

// A throwaway key pair for push notifications, made fresh for each run.
const vapid = webpush.generateVAPIDKeys();
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = {
  ...process.env,
  DATABASE_URL: "file:e2e.db",
  MARKET_DATA_SOURCE: "mock",
  BACKTEST_ENGINE: "python",
  ANALYTICS_URL: "http://127.0.0.1:8010",
  ANALYTICS_SERVICE_TOKEN: "e2e-only-token",
  BETTER_AUTH_SECRET: "e2e-only-not-a-real-secret-0123456789abcdef",
  BETTER_AUTH_URL: "http://localhost:3010",
  CRON_SECRET: "e2e-cron",
  VAPID_PUBLIC_KEY: vapid.publicKey,
  VAPID_PRIVATE_KEY: vapid.privateKey,
  // The ⌘K search and similar use no external services; keep the app's telemetry quiet.
  NEXT_TELEMETRY_DISABLED: "1",
};
delete env.TIINGO_API_KEY;

for (const suffix of ["", "-shm", "-wal", "-journal"]) rmSync(join(root, `e2e.db${suffix}`), { force: true });
const migrated = spawnSync("npx", ["drizzle-kit", "migrate"], { cwd: root, env, stdio: "inherit" });
if (migrated.status !== 0) process.exit(migrated.status ?? 1);

const children = [
  spawn("uv", ["run", "--extra", "dev", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8010"], { cwd: join(root, "services/analytics"), env, stdio: "inherit" }),
  spawn("npx", ["next", "start", "-p", "3010"], { cwd: root, env, stdio: "inherit" }),
];
const stop = () => {
  for (const child of children) child.kill("SIGTERM");
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const child of children) child.on("exit", (code) => code && code !== 0 && process.exit(code));
