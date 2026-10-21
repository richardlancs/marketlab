"use server";

/**
 * Server Actions for push notifications (lib/alert-pushes.ts): whether this
 * browser gets them, turning them on or off, and a test notification. Each
 * device belongs to whoever is using the browser: the signed-in user, or the
 * guest (whose devices move to their account when they sign in).
 */
import { pushPublicKey, sendPush } from "./alert-pushes";
import { push } from "./db";
import { currentOwner } from "./owner";
import { MAX_DEVICES, parseSubscription, TEST_MESSAGE } from "./push";
import { allow } from "./rate-limit";

export type PushSettings = { status: "off-here" } | { status: "ready"; publicKey: string; on: boolean };
export type PushTestResult = { ok: true } | { ok: false; message: string };

/**
 * A brand-new subscription can take a few seconds to reach the push
 * service, which until then answers as if it were gone. Within this long of
 * setting up, that answer means "not yet", and the device is kept.
 */
const SETTLING = 2 * 60_000;

const endpointOf = (input: unknown) => (typeof input === "string" && input.length <= 1000 ? input : null);

/** Push's state for this browser; `endpoint` is the browser's current subscription, if it has one. */
export async function pushSettingsAction(endpoint: unknown): Promise<PushSettings> {
  const publicKey = pushPublicKey();
  if (!publicKey) return { status: "off-here" };
  const e = endpointOf(endpoint);
  const owner = e ? await currentOwner({ create: false }) : null;
  return { status: "ready", publicKey, on: Boolean(owner && e && (await push.get(owner.id, e))) };
}

/** Stores the browser's new subscription for this visitor. */
export async function subscribePushAction(subscription: unknown): Promise<PushSettings> {
  const device = parseSubscription(subscription);
  if (!pushPublicKey() || !device || !(await allow("push", 10, 60))) return pushSettingsAction(device?.endpoint);
  const owner = await currentOwner({ create: true });
  if (owner) await push.add(owner.id, device, MAX_DEVICES);
  return pushSettingsAction(device.endpoint);
}

export async function unsubscribePushAction(endpoint: unknown): Promise<PushSettings> {
  const e = endpointOf(endpoint);
  const owner = e ? await currentOwner({ create: false }) : null;
  if (owner && e) await push.removeFor(owner.id, e);
  return pushSettingsAction(null);
}

/** Sends the test notification to this browser, if it's one of this visitor's devices. */
export async function sendTestPushAction(endpoint: unknown): Promise<PushTestResult> {
  const e = endpointOf(endpoint);
  if (!(await allow("push-test", 3, 60))) return { ok: false, message: "Wait a minute before sending another test." };
  const owner = e ? await currentOwner({ create: false }) : null;
  const device = owner && e ? await push.get(owner.id, e) : null;
  if (!device) return { ok: false, message: "Notifications aren't on for this device." };
  const result = await sendPush(device, TEST_MESSAGE);
  if (result === "sent") return { ok: true };
  if (result === "failed") return { ok: false, message: "The push service didn't accept it. Try again later." };
  if (Date.now() - device.createdAt < SETTLING) return { ok: false, message: "This device was only just set up, and the push service isn't ready for it yet. Try again in a minute." };
  await push.remove([device.endpoint]);
  return { ok: false, message: "This browser's subscription has expired. Turn notifications off and on again." };
}
