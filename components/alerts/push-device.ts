/**
 * This browser's push subscription: the service worker (public/sw.js) that
 * shows notifications, and the subscription the push service gives it.
 * Browser-only; the server side is lib/push-actions.ts.
 */
import { unsubscribePushAction } from "@/lib/push-actions";

/** Whether this browser can get push notifications at all. */
export function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** An iPhone or iPad in Safari, not the home-screen app: push only works once it's added to the Home Screen. */
export function needsHomeScreen(): boolean {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const installed = matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  return ios && !installed;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration("/");
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/** The VAPID public key (base64url) as the bytes PushManager wants. */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const raw = atob(base64url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (base64url.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Asks for permission (if needed) and subscribes this browser. Null if permission isn't given. */
export async function subscribeDevice(publicKey: string): Promise<PushSubscription | null> {
  if ((await Notification.requestPermission()) !== "granted") return null;
  await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  const registration = await navigator.serviceWorker.ready;
  const key = keyBytes(publicKey);
  const existing = await registration.pushManager.getSubscription();
  // A subscription made with another key (a different deployment's) can't receive our pushes.
  if (existing) {
    const old = existing.options.applicationServerKey;
    if (old && new Uint8Array(old).every((b, i) => b === key[i])) return existing;
    await existing.unsubscribe();
  }
  return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
}

/**
 * Stops notifications on this browser: forgets it on the server (while the
 * visitor is still who they are) and unsubscribes it. Used by the switch
 * and on sign-out, so the next person on a shared computer doesn't get them.
 */
export async function forgetDevice(): Promise<void> {
  const subscription = await currentSubscription().catch(() => null);
  if (!subscription) return;
  await unsubscribePushAction(subscription.endpoint).catch(() => {});
  await subscription.unsubscribe().catch(() => {});
}
