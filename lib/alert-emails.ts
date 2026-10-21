/**
 * Sends alert digests (lib/alert-digest.ts) to everyone who's due one
 * (lib/db/alert-emails.ts). Run by the daily job, after accounts are caught
 * up (that's when alerts trigger), within the time it's given.
 */
import "server-only";
import { alertDigestEmail, unsubscribeUrl } from "./alert-digest";
import { alertEmails } from "./db";
import { emailEnabled, sendEmail } from "./email";

/** Alerts that triggered longer ago than this aren't news any more, and aren't emailed. */
const FRESH_FOR = 7 * 86_400_000;

export interface DigestSummary {
  sent: number;
  failed: number;
  skipped?: string;
}

export async function sendAlertDigests(deadline: number, now: () => number = Date.now): Promise<DigestSummary> {
  const secret = process.env.BETTER_AUTH_SECRET;
  const siteUrl = process.env.BETTER_AUTH_URL;
  if (!emailEnabled()) return { sent: 0, failed: 0, skipped: "Email isn't set up on this deployment." };
  if (!secret || !siteUrl) return { sent: 0, failed: 0, skipped: "BETTER_AUTH_SECRET and BETTER_AUTH_URL are needed for unsubscribe links." };

  let sent = 0;
  let failed = 0;
  for (const digest of await alertEmails.due(now() - FRESH_FOR, 200)) {
    if (now() > deadline) break;
    try {
      await sendEmail(alertDigestEmail({ to: digest.email, name: digest.name, alerts: digest.alerts.map((a) => ({ ...a, condition: a.condition ?? undefined, triggerPrice: a.triggerPrice ?? undefined })), siteUrl, unsubscribe: unsubscribeUrl(siteUrl, digest.userId, secret) }));
      await alertEmails.markEmailed(digest.userId, digest.alerts.map((a) => a.id));
      sent++;
    } catch (error) {
      // Left unmarked, so it's tried again tomorrow (until it's a week old).
      console.error("[alert emails] couldn't send a digest:", error instanceof Error ? error.message : error);
      failed++;
    }
  }
  return { sent, failed };
}
