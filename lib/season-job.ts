/**
 * The daily job's season step (lib/maintenance.ts runs it after accounts are
 * caught up, so season portfolios are already up to date with the close):
 *
 * - opens this month's season, and tells last season's players it's open;
 * - records every entry's value at the latest close;
 * - three days before the end, tells each player where they stand;
 * - once the latest close is in a later month, freezes the final standings
 *   at each entry's last recorded value, awards the season badges and tells
 *   everyone how they finished.
 *
 * Notifications go to the devices people turned push on for, and the final
 * result also by email to those with alert emails on. Each kind goes out
 * once per season (the season row's *_at columns).
 */
import "server-only";
import { eq } from "drizzle-orm";
import { pushPublicKey, sendPush } from "./alert-pushes";
import { unsubscribeUrl } from "./alert-digest";
import { seasonBadges } from "./badges";
import { alertEmails, db, push, seasons } from "./db";
import { user } from "./db/schema";
import { emailEnabled, sendEmail } from "./email";
import { getMarket } from "./market";
import type { PushMessage } from "./push";
import { previousSeasonId, rank, seasonDue, seasonIdOf, seasonMessages } from "./seasons";
import { valueEntries } from "./season-data";

export interface SeasonSummary {
  recorded: number;
  closed: string[];
  notified: number;
}

/** Sends each user their message on every device they have. Returns how many people at least one reached. */
async function notify(messages: Map<string, Omit<PushMessage, "tag"> & { tag?: string }>): Promise<number> {
  if (!pushPublicKey() || messages.size === 0) return 0;
  const devices = await push.devicesOf([...messages.keys()]);
  let reached = 0;
  const gone: string[] = [];
  for (const [userId, message] of messages) {
    let any = false;
    for (const device of devices.get(userId) ?? []) {
      const result = await sendPush(device, { tag: message.url, ...message });
      if (result === "sent") any = true;
      if (result === "gone") gone.push(device.endpoint);
    }
    if (any) reached++;
  }
  await push.remove(gone);
  return reached;
}

/** The final result by email, to players who turned alert emails on and confirmed their address. */
async function emailResults(results: { userId: string; title: string; body: string; url: string }[]) {
  const secret = process.env.BETTER_AUTH_SECRET;
  const site = process.env.BETTER_AUTH_URL;
  if (!emailEnabled() || !secret || !site) return;
  for (const r of results) {
    if (!(await alertEmails.enabled(r.userId))) continue;
    const [me] = await db.select({ email: user.email, verified: user.emailVerified }).from(user).where(eq(user.id, r.userId));
    if (!me?.verified) continue;
    const link = new URL(r.url, site).href;
    const unsubscribe = unsubscribeUrl(site, r.userId, secret);
    await sendEmail({
      to: me.email,
      subject: `MarketLab: ${r.title}`,
      text: `${r.body}\n\nSee the final standings: ${link}\n\nYou get this because you turned on alert emails. Stop these emails: ${unsubscribe}`,
      html: `<p>${r.body}</p><p><a href="${link}">See the final standings</a></p><p style="color:#666;font-size:12px">You get this because you turned on alert emails. <a href="${unsubscribe}">Stop these emails</a>.</p>`,
      headers: { "List-Unsubscribe": `<${unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    }).catch((error) => console.error("[seasons] couldn't email a result:", error instanceof Error ? error.message : error));
  }
}

export async function runSeasons(latestClose: number, deadline: number, now: () => number = Date.now): Promise<SeasonSummary> {
  const summary: SeasonSummary = { recorded: 0, closed: [], notified: 0 };
  await seasons.ensure(seasonIdOf(now()), now());
  const market = await getMarket();
  const prices = new Map(market.stocks.map((s) => [s.symbol, s.price]));

  for (const s of await seasons.open()) {
    if (now() > deadline) break;
    const due = seasonDue(s.id, latestClose, now(), s);

    if (due.announce) {
      const message = seasonMessages.open(s.id);
      summary.notified += await notify(new Map((await seasons.ownersOf(previousSeasonId(s.id))).map((id) => [id, message])));
      await seasons.markAnnounced(s.id, now());
    }

    if (due.record || due.remind) {
      const valued = valueEntries(await seasons.entriesWithHoldings(s.id), prices);
      if (due.record) {
        await seasons.recordStandings(latestClose, valued.map(({ accountId, value }) => ({ accountId, value })));
        summary.recorded += valued.length;
      }
      if (due.remind) {
        const ranked = rank(valued);
        summary.notified += await notify(new Map(ranked.map((e) => [e.userId, seasonMessages.reminder(s.id, e.rank, ranked.length)])));
        await seasons.markReminded(s.id, now());
      }
    }

    if (due.close) {
      const entries = await seasons.entriesWithHoldings(s.id);
      const last = await seasons.lastValues(s.id);
      // Someone who joined after the last recorded close still has their starting value.
      const finals = rank(entries.map((e) => ({ ...e, value: last.get(e.accountId) ?? e.startValue })));
      await seasons.close(s.id, finals.map(({ accountId, value, rank }) => ({ accountId, value, rank })), now());
      for (const f of finals) await seasons.award(f.userId, seasonBadges(s.id, f.rank, finals.length), now());
      const results = finals.map((f) => ({ userId: f.userId, ...seasonMessages.result(s.id, f.rank, finals.length, f.value) }));
      summary.notified += await notify(new Map(results.map(({ userId, ...m }) => [userId, m])));
      await emailResults(results);
      summary.closed.push(s.id);
    }
  }
  return summary;
}
