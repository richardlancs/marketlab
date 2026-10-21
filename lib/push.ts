/**
 * Push notifications for alerts: checking a browser's subscription before
 * it's stored, and what a notification says. Pure, so it's unit-tested;
 * lib/alert-pushes.ts sends them and public/sw.js shows them.
 */
import { describeAlert } from "./alerts";
import { formatCurrency } from "./format";
import type { PriceAlert } from "./trading";

/** The most devices one person can get notifications on; a new one beyond it replaces their oldest. */
export const MAX_DEVICES = 10;

/** What a browser's PushSubscription.toJSON() gives, checked. */
export interface DeviceSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * The push services browsers use (Chrome and Edge via Google, Firefox,
 * Safari, older Edge). The daily job sends a request to each stored
 * endpoint, so anything else is refused: a forged "subscription" must not
 * turn the server into a way to call arbitrary URLs.
 */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^web\.push\.apple\.com$/, /^[a-z0-9-]+\.notify\.windows\.com$/];

const base64url = (s: unknown, min: number, max: number): s is string => typeof s === "string" && s.length >= min && s.length <= max && /^[A-Za-z0-9_-]+={0,2}$/.test(s);

export function parseSubscription(input: unknown): DeviceSubscription | null {
  if (typeof input !== "object" || input === null) return null;
  const { endpoint, keys } = input as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof endpoint !== "string" || endpoint.length > 1000) return null;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.port || url.username || url.password || !PUSH_HOSTS.some((h) => h.test(url.hostname))) return null;
  // A P-256 public key is 65 bytes (87 characters of base64url); the auth secret is 16 bytes (22).
  if (!base64url(keys?.p256dh, 80, 100) || !base64url(keys?.auth, 16, 32)) return null;
  return { endpoint: url.href, p256dh: keys.p256dh, auth: keys.auth };
}

/** What public/sw.js shows. `tag` makes the browser replace, not repeat, a notification about the same alert. */
export interface PushMessage {
  title: string;
  body: string;
  /** The page a click opens, on this site. */
  url: string;
  tag: string;
}

export type PushAlert = Pick<PriceAlert, "id" | "symbol" | "direction" | "price" | "condition" | "triggerPrice">;

/** Up to this many alerts get a notification each; more are summed up in one. */
export const SEPARATE_UP_TO = 3;

/** The notifications for one person's newly triggered alerts. */
export function alertMessages(alerts: readonly PushAlert[]): PushMessage[] {
  if (alerts.length <= SEPARATE_UP_TO) {
    return alerts.map((a) => ({
      // The same words as the in-app notification (components/alerts/alerts-badge.tsx), with the same tag.
      title: `${a.symbol} ${describeAlert(a)}`,
      body: `It closed at ${formatCurrency(a.triggerPrice ?? a.price)}.`,
      url: `/stocks/${encodeURIComponent(a.symbol)}`,
      tag: a.id,
    }));
  }
  const symbols = [...new Set(alerts.map((a) => a.symbol))];
  const named = symbols.length > 4 ? `${symbols.slice(0, 3).join(", ")} and ${symbols.length - 3} more` : symbols.length > 1 ? `${symbols.slice(0, -1).join(", ")} and ${symbols.at(-1)}` : symbols[0];
  return [{ title: `${alerts.length} of your alerts triggered`, body: `${named}, at the close.`, url: "/watchlist#alerts", tag: "alerts" }];
}

/** The test notification someone can send to the device they're on. */
export const TEST_MESSAGE: PushMessage = {
  title: "MarketLab notifications are on",
  body: "Alerts that trigger at the close will show up here, even when MarketLab isn't open.",
  url: "/watchlist#alerts",
  tag: "test",
};
