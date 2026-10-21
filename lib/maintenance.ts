/**
 * The daily job (app/api/cron/daily, run by Vercel Cron after the close):
 *
 * 1. Catches up every account with the latest close: limit and stop orders
 *    fill, dividends and splits are paid, alerts trigger, the same evening,
 *    whether or not anyone visits. It's the same catching up a visit does
 *    (lib/processing.ts), which is safe to run twice, so the job and a visit
 *    can never apply anything twice.
 * 2. Deletes guests nobody has used for GUEST_LIFETIME, with everything they
 *    own, and other leftovers (including saved price snapshots no run uses).
 * 3. Emails alert digests to users who asked for them (lib/alert-emails.ts),
 *    and sends push notifications to devices signed up for them (lib/alert-pushes.ts).
 * 4. Refreshes a few companies' reported numbers from the SEC
 *    (lib/fundamentals.ts), each about once a week.
 * 5. Stores the latest prices and has the analytics service recalculate
 *    what changed (lib/analytics/server.ts), with whatever time is left.
 *
 * Accounts go in batches, within a time budget: whatever doesn't fit waits
 * for the next run (or for its owner's next visit, which catches up too).
 * Written against the small set of functions in DailyDeps, so the steps can
 * be tested without a database or a market.
 */

const DAY = 24 * 60 * 60 * 1000;
/** How long an unused guest is kept. */
export const GUEST_LIFETIME = 180 * DAY;
/** The most time the job spends on company numbers. */
const FUNDAMENTALS_SLOT = 10_000;

export interface DailyDeps {
  now(): number;
  /** The market's latest close, freshly loaded. */
  latestClose(): Promise<number>;
  /** Users whose account is behind `latest`, longest-waiting first. */
  listBehind(latest: number, limit: number): Promise<string[]>;
  /** Brings one account up to date. */
  catchUp(userId: string): Promise<void>;
  deleteInactiveGuests(cutoff: number, limit: number): Promise<number>;
  deleteOrphanLearners(cutoff: number, limit: number): Promise<number>;
  pruneRateLimits(before: number): Promise<void>;
  /** Deletes saved price snapshots no saved run refers to any more. */
  deleteOrphanSnapshots(limit: number): Promise<number>;
  /** Emails digests of newly triggered alerts, until `deadline` (ms). Optional, so tests can leave it out. */
  sendAlertEmails?(deadline: number): Promise<unknown>;
  /** Pushes newly triggered alerts to people's devices, until `deadline` (ms). Optional, so tests can leave it out. */
  sendAlertPushes?(deadline: number): Promise<unknown>;
  /** Fetches company numbers that are due, until `deadline` (ms). Optional, so tests can leave it out. */
  refreshFundamentals?(deadline: number): Promise<unknown>;
  /** Stores the latest prices and recalculates stored analytics, until `deadline` (ms). Optional, so tests can leave it out. */
  refreshAnalytics?(deadline: number): Promise<unknown>;
}

export interface DailySummary {
  latestClose: number;
  caughtUp: number;
  failed: number;
  /** True if time ran out with accounts still behind. */
  unfinished: boolean;
  guestsDeleted: number;
  learnersDeleted: number;
  snapshotsDeleted: number;
  /** What the alert email, push, fundamentals and analytics steps did, or why they didn't run. */
  alertEmails?: unknown;
  alertPushes?: unknown;
  fundamentals?: unknown;
  analytics?: unknown;
  ms: number;
}

export async function runDaily(deps: DailyDeps, { budgetMs = 50_000, batch = 50 } = {}): Promise<DailySummary> {
  const start = deps.now();
  const outOfTime = () => deps.now() - start > budgetMs;
  const latest = await deps.latestClose();

  let caughtUp = 0;
  let failed = 0;
  let unfinished = false;
  // An account that can't advance today (say, a stock's prices are missing)
  // stays behind; it's tried once per run, not over and over.
  const tried = new Set<string>();
  for (;;) {
    if (outOfTime()) {
      unfinished = true;
      break;
    }
    const due = (await deps.listBehind(latest, batch + tried.size)).filter((id) => !tried.has(id)).slice(0, batch);
    if (due.length === 0) break;
    for (const id of due) {
      if (outOfTime()) {
        unfinished = true;
        break;
      }
      tried.add(id);
      try {
        await deps.catchUp(id);
        caughtUp++;
      } catch {
        failed++;
      }
    }
    if (unfinished) break;
  }

  const cutoff = deps.now() - GUEST_LIFETIME;
  const guestsDeleted = outOfTime() ? 0 : await deps.deleteInactiveGuests(cutoff, 500);
  const learnersDeleted = outOfTime() ? 0 : await deps.deleteOrphanLearners(cutoff, 500);
  await deps.pruneRateLimits(deps.now() - DAY);
  // After the guests: their saved runs (and so their snapshots' last references) went with them.
  const snapshotsDeleted = outOfTime() ? 0 : await deps.deleteOrphanSnapshots(500);

  // Alert emails and pushes: right after catching up, which is when alerts trigger.
  let alertEmails: unknown;
  if (deps.sendAlertEmails) {
    try {
      alertEmails = outOfTime() ? "skipped: out of time" : await deps.sendAlertEmails(start + budgetMs);
    } catch (error) {
      alertEmails = `failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  let alertPushes: unknown;
  if (deps.sendAlertPushes) {
    try {
      alertPushes = outOfTime() ? "skipped: out of time" : await deps.sendAlertPushes(start + budgetMs);
    } catch (error) {
      alertPushes = `failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  // A short slot: a week of runs covers every company, so there's no hurry.
  let fundamentals: unknown;
  if (deps.refreshFundamentals) {
    try {
      fundamentals = outOfTime() ? "skipped: out of time" : await deps.refreshFundamentals(Math.min(start + budgetMs, deps.now() + FUNDAMENTALS_SLOT));
    } catch (error) {
      fundamentals = `failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  // Last, with the time that's left: analytics can always catch up tomorrow, or on a page visit.
  let analytics: unknown;
  if (deps.refreshAnalytics) {
    try {
      analytics = outOfTime() ? "skipped: out of time" : await deps.refreshAnalytics(start + budgetMs);
    } catch (error) {
      analytics = `failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  return { latestClose: latest, caughtUp, failed, unfinished, guestsDeleted, learnersDeleted, snapshotsDeleted, alertEmails, alertPushes, fundamentals, analytics, ms: deps.now() - start };
}
