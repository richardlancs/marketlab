import { revalidateTag } from "next/cache";
import { refreshAnalytics } from "@/lib/analytics/server";
import { accounts, backtests, guests, jobs, learning } from "@/lib/db";
import { getMarket, getProcessingData } from "@/lib/market";
import { runDaily } from "@/lib/maintenance";
import { symbolsToProcess } from "@/lib/processing";
import { pruneRateLimits } from "@/lib/rate-limit";

/** Up to a minute; the job itself stops at about 50 seconds and leaves the rest for next time. */
export const maxDuration = 60;

/**
 * GET /api/cron/daily: the daily job (lib/maintenance.ts), run by Vercel Cron
 * after the market closes (vercel.json). Only Vercel may run it: it sends
 * the CRON_SECRET environment variable as a bearer token, and anything else
 * is refused, including every request when no secret is set.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Not allowed" }, { status: 401 });
  }

  const startedAt = Date.now();
  let summary;
  try {
    summary = await runDaily({
      now: Date.now,
      async latestClose() {
        // Fresh market data, so accounts are caught up with today's close, not an hour-old copy.
        revalidateTag("market", { expire: 0 });
        return (await getMarket()).asOf;
      },
      listBehind: (latest, limit) => accounts.listBehind(latest, limit),
      async catchUp(userId) {
        const account = await accounts.load(userId);
        if (!account) return;
        const market = await getProcessingData(symbolsToProcess(account));
        const result = await accounts.update(userId, market, (a) => ({ ok: true, account: a }));
        if (!result.ok) throw new Error(result.message);
      },
      deleteInactiveGuests: (cutoff, limit) => guests.deleteInactive(cutoff, limit),
      deleteOrphanLearners: (cutoff, limit) => learning.deleteOrphans(cutoff, limit),
      pruneRateLimits,
      deleteOrphanSnapshots: (limit) => backtests.deleteOrphanSnapshots(limit),
      refreshAnalytics: (deadline) => refreshAnalytics(deadline),
    });
  } catch (error) {
    // Recorded, so /api/health (and the uptime check that reads it) reports the failure.
    const message = error instanceof Error ? error.message : String(error);
    console.error("[cron] daily job failed:", message);
    await jobs.record("daily", { startedAt, finishedAt: Date.now(), ok: false, summary: { error: message } }).catch(() => {});
    return Response.json({ error: "The daily job failed." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
  await jobs.record("daily", { startedAt, finishedAt: Date.now(), ok: true, summary }).catch((error) => console.error("[cron] couldn't record the run:", error));
  console.log("[cron] daily job:", JSON.stringify(summary));
  return Response.json(summary, { headers: { "Cache-Control": "no-store" } });
}
