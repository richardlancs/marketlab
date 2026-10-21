/**
 * The alert email: one message listing the alerts that triggered for a user,
 * with a signed one-click unsubscribe link. Pure apart from the HMAC, so it's
 * unit-tested; lib/alert-emails.ts sends it.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { describeAlert } from "./alerts";
import type { Email } from "./email";
import { formatCurrency, formatDate } from "./format";
import type { PriceAlert } from "./trading";

export type DigestAlert = Pick<PriceAlert, "symbol" | "direction" | "price" | "condition" | "triggeredAt" | "triggerPrice">;

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** A token that proves an unsubscribe link was made for this user, without storing anything. */
export function unsubscribeToken(userId: string, secret: string): string {
  return createHmac("sha256", secret).update(`unsubscribe:alerts:${userId}`).digest("base64url");
}

export function verifyUnsubscribeToken(userId: string, token: string, secret: string): boolean {
  const expected = Buffer.from(unsubscribeToken(userId, secret));
  const given = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function unsubscribeUrl(siteUrl: string, userId: string, secret: string): string {
  const url = new URL("/api/email/unsubscribe", siteUrl);
  url.searchParams.set("u", userId);
  url.searchParams.set("t", unsubscribeToken(userId, secret));
  return url.href;
}

export function alertDigestEmail({ to, name, alerts, siteUrl, unsubscribe }: { to: string; name: string; alerts: readonly DigestAlert[]; siteUrl: string; unsubscribe: string }): Email {
  const greeting = name.trim() ? `Hi ${name.trim()},` : "Hi,";
  const lines = alerts.map((a) => ({
    text: `${a.symbol} ${describeAlert(a)}: closed at ${formatCurrency(a.triggerPrice ?? a.price)} on ${formatDate(a.triggeredAt ?? 0)}`,
    href: new URL(`/stocks/${encodeURIComponent(a.symbol)}`, siteUrl).href,
  }));
  const subject = alerts.length === 1 ? `MarketLab alert: ${alerts[0].symbol} ${describeAlert(alerts[0])}` : `MarketLab: ${alerts.length} of your alerts triggered`;
  const footer = "You get this because you turned on alert emails in MarketLab. Prices are simulated; nothing here is investment advice.";
  return {
    to,
    subject,
    text: `${greeting}\n\n${alerts.length === 1 ? "An alert you set triggered" : "Alerts you set triggered"} at the close:\n\n${lines.map((l) => `- ${l.text}\n  ${l.href}`).join("\n")}\n\n${footer}\nStop these emails: ${unsubscribe}`,
    html:
      `<p>${escape(greeting)}</p><p>${alerts.length === 1 ? "An alert you set triggered" : "Alerts you set triggered"} at the close:</p>` +
      `<ul>${lines.map((l) => `<li><a href="${escape(l.href)}">${escape(l.text)}</a></li>`).join("")}</ul>` +
      `<p style="color:#666;font-size:12px">${escape(footer)} <a href="${escape(unsubscribe)}">Stop these emails</a>.</p>`,
    // One-click unsubscribe in mail apps (RFC 8058).
    headers: { "List-Unsubscribe": `<${unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}
