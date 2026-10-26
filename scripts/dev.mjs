// `npm run dev`: the Next.js dev server and, alongside it, the Python
// analytics service (services/analytics), which backtests, sweeps and the
// analytics cards need. The two are wired together here: unless .env.local
// says otherwise, the service listens on 127.0.0.1:8000 and both sides get
// the same throwaway token for this run. Without uv installed, only Next.js
// starts, with a note on what won't work. Ctrl+C stops both.
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The names .env.local sets (Next.js reads the values itself; this only needs to know what's there). */
const local = existsSync(join(root, ".env.local"))
  ? Object.fromEntries(
      readFileSync(join(root, ".env.local"), "utf8")
        .split("\n")
        .map((line) => /^([A-Z0-9_]+)=(.*)$/.exec(line.trim()))
        .filter(Boolean)
        .map(([, name, value]) => [name, value.replace(/^["']|["']$/g, "")]),
    )
  : {};

const env = { ...process.env };
const setting = (name, fallback) => process.env[name] ?? local[name] ?? fallback;
env.ANALYTICS_URL = setting("ANALYTICS_URL", "http://127.0.0.1:8000");
env.ANALYTICS_SERVICE_TOKEN = setting("ANALYTICS_SERVICE_TOKEN", randomBytes(24).toString("base64url"));

const children = [spawn("npx", ["next", "dev", ...process.argv.slice(2)], { cwd: root, env, stdio: "inherit" })];

const hasUv = spawnSync("uv", ["--version"], { stdio: "ignore" }).status === 0;
if (!hasUv) {
  console.warn("\n[dev] uv isn't installed, so the Python analytics service isn't running: backtests and the analytics cards won't work. Install uv (https://docs.astral.sh/uv/), then run npm run analytics:install.\n");
} else {
  const port = new URL(env.ANALYTICS_URL).port || "8000";
  const envFile = existsSync(join(root, ".env.local")) ? ["--env-file", "../../.env.local"] : [];
  children.push(
    spawn("uv", ["run", "--extra", "dev", ...envFile, "uvicorn", "main:app", "--host", "127.0.0.1", "--port", port, "--reload"], {
      cwd: join(root, "services/analytics"),
      env,
      stdio: "inherit",
    }),
  );
}

const stop = () => {
  for (const child of children) child.kill("SIGTERM");
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
// Next.js exiting ends the session; the Python service exiting is reported but leaves Next.js running.
children[0].on("exit", (code) => {
  for (const child of children.slice(1)) child.kill("SIGTERM");
  process.exit(code ?? 0);
});
children[1]?.on("exit", (code) => code && console.warn(`\n[dev] The Python analytics service stopped (exit ${code}). Next.js keeps running; restart npm run dev to bring it back.\n`));
