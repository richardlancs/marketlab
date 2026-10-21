/**
 * What /api/health reports, decided from facts the route gathers. Pure, so
 * the rules are unit-tested. Each check is "ok", "warn" (worth a look, the
 * site still works) or "fail" (something users would notice). Any failure
 * makes the answer 503, which the hourly uptime check (GitHub Actions) turns
 * into an issue.
 */

export type CheckStatus = "ok" | "warn" | "fail";
export interface Check {
  status: CheckStatus;
  detail: string;
}

export interface HealthFacts {
  now: number;
  database: { ok: true } | { ok: false; error: string };
  analytics: { configured: false } | { configured: true; ok: true; version: string } | { configured: true; ok: false; error: string };
  market: { latestClose: number; fallback: boolean } | { error: string };
  dailyJob: { startedAt: number; ok: boolean; unfinished: boolean } | null;
  /** The newest stored stock profile's close, or null if there are none. */
  newestProfile: number | null;
}

const HOUR = 3_600_000;
/** The daily job runs every weekday: from Friday evening to Monday evening is 72 hours. */
export const JOB_MAX_AGE = 80 * HOUR;
/** Stored analytics more than this behind the latest close are stale. */
export const PROFILE_MAX_LAG = 4 * 24 * HOUR;

export function assessHealth(f: HealthFacts): { status: "ok" | "degraded" | "down"; checks: Record<string, Check> } {
  const checks: Record<string, Check> = {};
  checks.database = f.database.ok ? { status: "ok", detail: "Reachable." } : { status: "fail", detail: `Unreachable: ${f.database.error}` };

  if (!f.analytics.configured) checks.analytics = { status: "warn", detail: "The analytics service isn't configured on this server." };
  else checks.analytics = f.analytics.ok ? { status: "ok", detail: `Python engine ${f.analytics.version}.` } : { status: "fail", detail: `Unreachable: ${f.analytics.error}` };

  if ("error" in f.market) checks.market = { status: "fail", detail: `Market data failed: ${f.market.error}` };
  else checks.market = f.market.fallback ? { status: "warn", detail: "Real prices are unavailable; showing the mock market." } : { status: "ok", detail: `Latest close ${new Date(f.market.latestClose).toISOString()}.` };

  if (!f.dailyJob) checks.dailyJob = { status: "warn", detail: "The daily job hasn't recorded a run yet." };
  else if (!f.dailyJob.ok) checks.dailyJob = { status: "fail", detail: `The last run (${new Date(f.dailyJob.startedAt).toISOString()}) failed.` };
  else if (f.now - f.dailyJob.startedAt > JOB_MAX_AGE) checks.dailyJob = { status: "fail", detail: `No run since ${new Date(f.dailyJob.startedAt).toISOString()}.` };
  else if (f.dailyJob.unfinished) checks.dailyJob = { status: "warn", detail: "The last run ran out of time; the rest waits for the next one." };
  else checks.dailyJob = { status: "ok", detail: `Last run ${new Date(f.dailyJob.startedAt).toISOString()}.` };

  const latest = "error" in f.market ? null : f.market.latestClose;
  if (f.newestProfile === null) checks.analyticsData = { status: "warn", detail: "No stored stock profiles yet." };
  else if (latest !== null && latest - f.newestProfile > PROFILE_MAX_LAG) checks.analyticsData = { status: "fail", detail: `Stored analytics stop at ${new Date(f.newestProfile).toISOString()}.` };
  else checks.analyticsData = { status: "ok", detail: `Stored analytics through ${new Date(f.newestProfile).toISOString()}.` };

  const statuses = Object.values(checks).map((c) => c.status);
  return { status: statuses.includes("fail") ? "down" : statuses.includes("warn") ? "degraded" : "ok", checks };
}
