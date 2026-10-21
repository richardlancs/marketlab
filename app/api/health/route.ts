import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { pythonConfigured } from "@/lib/backtest/python-client";
import { db, jobs, prices } from "@/lib/db";
import { assessHealth, type HealthFacts } from "@/lib/health";
import { getMarket, priceSource } from "@/lib/market";

/** Gives up on a check after `ms`, so one hung dependency can't hang the health check. */
function within<T>(promise: Promise<T>, ms = 5000): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`no answer within ${ms / 1000} s`)), ms))]);
}
/** The analytics service sleeps when idle, and waking it can take several seconds; that's a slow answer, not an outage. */
const ANALYTICS_WAIT = 15_000;
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * GET /api/health: whether MarketLab is working (lib/health.ts), for the
 * hourly uptime check (.github/workflows/uptime.yml) and for people. 200 when
 * everything works ("ok" or "degraded"), 503 when something users would notice
 * doesn't. Public: it reveals only statuses and times.
 */
export async function GET() {
  await connection();
  const now = Date.now();

  const database = await within(db.run(sql`select 1`)).then(
    () => ({ ok: true as const }),
    (error) => ({ ok: false as const, error: message(error) }),
  );

  let analytics: HealthFacts["analytics"] = { configured: false };
  if (pythonConfigured()) {
    const base = process.env.ANALYTICS_URL as string;
    analytics = await within(fetch(new URL("health", base.endsWith("/") ? base : `${base}/`), { cache: "no-store" }).then((r) => r.json()), ANALYTICS_WAIT)
      .then((body) => (typeof body?.engine?.version === "string" ? { configured: true as const, ok: true as const, version: body.engine.version as string } : { configured: true as const, ok: false as const, error: "an unexpected answer" }))
      .catch((error) => ({ configured: true as const, ok: false as const, error: message(error) }));
  }

  const market = await within(getMarket()).then(
    (m) => ({ latestClose: m.asOf, fallback: Boolean(m.notice) }),
    (error) => ({ error: message(error) }),
  );

  const [latestJob, newestProfile] = database.ok
    ? await Promise.all([within(jobs.latest("daily")).catch(() => null), within(prices.newestResult("stock-profile", priceSource())).catch(() => null)])
    : [null, null];
  const summary = latestJob?.summary as { unfinished?: boolean; analytics?: { unfinished?: boolean } } | null;
  const dailyJob = latestJob && { startedAt: latestJob.startedAt, ok: latestJob.ok, unfinished: Boolean(summary?.unfinished || summary?.analytics?.unfinished) };

  const { status, checks } = assessHealth({ now, database, analytics, market, dailyJob, newestProfile });
  return Response.json({ status, checks, time: new Date(now).toISOString() }, { status: status === "down" ? 503 : 200, headers: { "Cache-Control": "no-store" } });
}
