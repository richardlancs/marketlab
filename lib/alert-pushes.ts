/**
 * Sends push notifications (lib/push.ts) for newly triggered alerts to
 * everyone with a device signed up (lib/db/push.ts). Run by the daily job
 * after accounts are caught up, within the time it's given. Also sends the
 * test notification from the alerts panel.
 *
 * Pushes are signed with this site's VAPID key pair (VAPID_PUBLIC_KEY and
 * VAPID_PRIVATE_KEY), which is how push services know they come from us.
 * Without the pair, push is off on the deployment.
 */
import "server-only";
import webpush, { WebPushError } from "web-push";
import { push } from "./db";
import { alertMessages, type DeviceSubscription, type PushMessage } from "./push";

/** Alerts that triggered longer ago than this aren't news any more, and aren't pushed. */
const FRESH_FOR = 2 * 86_400_000;
/** A push service keeps a notification this long for a device that's offline (seconds). */
const KEEP_FOR = 24 * 3600;
/** How long one push service gets to answer (ms). */
const SEND_TIMEOUT = 10_000;

/** The public key browsers subscribe with, or null where push isn't set up. */
export function pushPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY ? process.env.VAPID_PUBLIC_KEY : null;
}

/**
 * Who push services can contact about our pushes: an https URL or a mailto.
 * The site itself where it's on https (localhost isn't accepted), otherwise the code's home.
 */
function contact(): string {
  const site = process.env.BETTER_AUTH_URL;
  return process.env.VAPID_SUBJECT || (site?.startsWith("https://") ? site : "https://github.com/richardlancs/marketlab");
}

export type SendResult = "sent" | "gone" | "failed";

/** Sends one message to one device. "gone" means the device unsubscribed or expired, and should be forgotten. */
export async function sendPush(device: DeviceSubscription, message: PushMessage): Promise<SendResult> {
  const publicKey = pushPublicKey();
  if (!publicKey) return "failed";
  try {
    await webpush.sendNotification({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } }, JSON.stringify(message), {
      TTL: KEEP_FOR,
      urgency: "normal",
      timeout: SEND_TIMEOUT,
      vapidDetails: { subject: contact(), publicKey, privateKey: process.env.VAPID_PRIVATE_KEY as string },
    });
    return "sent";
  } catch (error) {
    if (error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410)) return "gone";
    console.error("[push] couldn't send:", error instanceof WebPushError ? `HTTP ${error.statusCode} ${error.body}`.slice(0, 200) : error instanceof Error ? error.message : error);
    return "failed";
  }
}

export interface PushSummary {
  people: number;
  sent: number;
  failed: number;
  devicesRemoved: number;
  skipped?: string;
}

export async function sendAlertPushes(deadline: number, now: () => number = Date.now): Promise<PushSummary> {
  if (!pushPublicKey()) return { people: 0, sent: 0, failed: 0, devicesRemoved: 0, skipped: "Push isn't set up on this deployment." };

  const summary: PushSummary = { people: 0, sent: 0, failed: 0, devicesRemoved: 0 };
  for (const due of await push.due(now() - FRESH_FOR, 200)) {
    if (now() > deadline) break;
    const messages = alertMessages(due.alerts);
    const reached: string[] = [];
    const gone: string[] = [];
    await Promise.all(
      due.devices.map(async (device) => {
        const results = [];
        for (const message of messages) results.push(await sendPush(device, message));
        if (results.includes("gone")) gone.push(device.endpoint);
        else if (results.includes("sent")) reached.push(device.endpoint);
        summary.sent += results.filter((r) => r === "sent").length;
        summary.failed += results.filter((r) => r === "failed").length;
      }),
    );
    await push.remove(gone);
    await push.markSent(reached);
    summary.devicesRemoved += gone.length;
    // Done once any device has them, or no device is left to try. If every
    // device failed for now, they're tried again tomorrow (while still fresh).
    if (reached.length || gone.length === due.devices.length) await push.markPushed(due.userId, due.alerts.map((a) => a.id));
    summary.people++;
  }
  return summary;
}
