// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// The sender, storage, the rate limit and the visitor are replaced with test doubles.
const sender = vi.hoisted(() => ({ key: "public" as string | null, pushPublicKey: () => sender.key, sendPush: vi.fn() }));
const db = vi.hoisted(() => ({ push: { add: vi.fn(), get: vi.fn(), removeFor: vi.fn(), remove: vi.fn() } }));
const owner = vi.hoisted(() => ({ current: { id: "user-1", kind: "user", pendingGuest: null } as { id: string; kind: string; pendingGuest: null } | null, creates: [] as boolean[] }));
const limits = vi.hoisted(() => ({ allowed: true, calls: [] as string[] }));
vi.mock("./alert-pushes", () => sender);
vi.mock("./db", () => db);
vi.mock("./owner", () => ({
  currentOwner: async ({ create }: { create: boolean }) => (owner.creates.push(create), owner.current),
}));
vi.mock("./rate-limit", () => ({
  allow: async (name: string) => (limits.calls.push(name), limits.allowed),
}));

const { pushSettingsAction, sendTestPushAction, subscribePushAction, unsubscribePushAction } = await import("./push-actions");

const endpoint = "https://fcm.googleapis.com/fcm/send/abc";
const subscription = { endpoint, expirationTime: null, keys: { p256dh: "B".padEnd(87, "x"), auth: "a".repeat(22) } };
const device = { endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, createdAt: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  sender.key = "public";
  owner.current = { id: "user-1", kind: "user", pendingGuest: null };
  owner.creates = [];
  limits.allowed = true;
  limits.calls = [];
  db.push.get.mockResolvedValue(null);
});

describe("push settings", () => {
  it("are off where push isn't set up", async () => {
    sender.key = null;
    expect(await pushSettingsAction(endpoint)).toEqual({ status: "off-here" });
    expect(await subscribePushAction(subscription)).toEqual({ status: "off-here" });
    expect(db.push.add).not.toHaveBeenCalled();
  });

  it("say whether this browser is one of the visitor's devices", async () => {
    expect(await pushSettingsAction(null)).toEqual({ status: "ready", publicKey: "public", on: false });
    db.push.get.mockResolvedValue(device);
    expect(await pushSettingsAction(endpoint)).toEqual({ status: "ready", publicKey: "public", on: true });
    expect(db.push.get).toHaveBeenCalledWith("user-1", endpoint);
    expect(owner.creates).toEqual([false]); // looking never creates a guest
  });
});

describe("turning push on and off", () => {
  it("stores a valid subscription for the visitor, making a guest if needed", async () => {
    db.push.add.mockImplementation(async () => db.push.get.mockResolvedValue(device));
    expect(await subscribePushAction(subscription)).toMatchObject({ status: "ready", on: true });
    expect(db.push.add).toHaveBeenCalledWith("user-1", { endpoint, p256dh: device.p256dh, auth: device.auth }, 10);
    expect(owner.creates[0]).toBe(true);
    expect(limits.calls).toEqual(["push"]);
  });

  it("refuses a forged subscription, and too many tries", async () => {
    expect(await subscribePushAction({ ...subscription, endpoint: "https://evil.example.com/x" })).toMatchObject({ on: false });
    limits.allowed = false;
    expect(await subscribePushAction(subscription)).toMatchObject({ on: false });
    expect(db.push.add).not.toHaveBeenCalled();
  });

  it("removes only the visitor's own device", async () => {
    await unsubscribePushAction(endpoint);
    expect(db.push.removeFor).toHaveBeenCalledWith("user-1", endpoint);
    owner.current = null;
    await unsubscribePushAction(endpoint);
    expect(db.push.removeFor).toHaveBeenCalledTimes(1);
  });
});

describe("the test notification", () => {
  it("goes only to the visitor's own device", async () => {
    expect(await sendTestPushAction(endpoint)).toMatchObject({ ok: false });
    expect(sender.sendPush).not.toHaveBeenCalled();
    db.push.get.mockResolvedValue(device);
    sender.sendPush.mockResolvedValue("sent");
    expect(await sendTestPushAction(endpoint)).toEqual({ ok: true });
    expect(sender.sendPush).toHaveBeenCalledWith(device, expect.objectContaining({ tag: "test" }));
  });

  it("keeps a device set up moments ago that the push service doesn't know yet", async () => {
    db.push.get.mockResolvedValue({ ...device, createdAt: Date.now() - 5_000 });
    sender.sendPush.mockResolvedValue("gone");
    expect(await sendTestPushAction(endpoint)).toMatchObject({ ok: false, message: expect.stringContaining("Try again in a minute") });
    expect(db.push.remove).not.toHaveBeenCalled();
  });

  it("forgets a device that's gone, and is rate limited", async () => {
    db.push.get.mockResolvedValue(device);
    sender.sendPush.mockResolvedValue("gone");
    expect(await sendTestPushAction(endpoint)).toMatchObject({ ok: false, message: expect.stringContaining("expired") });
    expect(db.push.remove).toHaveBeenCalledWith([endpoint]);
    limits.allowed = false;
    expect(await sendTestPushAction(endpoint)).toMatchObject({ ok: false, message: expect.stringContaining("Wait a minute") });
  });
});
