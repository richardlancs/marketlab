// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// "server-only" refuses to load outside the server build; here it's just a marker.
vi.mock("server-only", () => ({}));
// The push services and the database are replaced with test doubles.
const webpush = vi.hoisted(() => {
  class WebPushError extends Error {
    constructor(
      message: string,
      public statusCode: number,
      public body = "",
    ) {
      super(message);
    }
  }
  return { WebPushError, sendNotification: vi.fn() };
});
vi.mock("web-push", () => ({ default: webpush, WebPushError: webpush.WebPushError }));
const db = vi.hoisted(() => ({ push: { due: vi.fn(), remove: vi.fn(), markSent: vi.fn(), markPushed: vi.fn() } }));
vi.mock("./db", () => db);

const { sendAlertPushes, sendPush } = await import("./alert-pushes");

const device = (n: string) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${n}`, p256dh: `k${n}`, auth: `a${n}` });
const alert = (id: string) => ({ id, symbol: "KO", direction: "above" as const, price: 70, triggerPrice: 71 });
const message = { title: "t", body: "b", url: "/", tag: "x" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VAPID_PUBLIC_KEY", "public");
  vi.stubEnv("VAPID_PRIVATE_KEY", "private");
  vi.stubEnv("BETTER_AUTH_URL", "https://marketlab.example");
  webpush.sendNotification.mockResolvedValue({ statusCode: 201 });
});
afterEach(() => vi.unstubAllEnvs());

describe("sending one push", () => {
  it("signs it as this site and keeps it a day for offline devices", async () => {
    expect(await sendPush(device("1"), message)).toBe("sent");
    const [subscription, payload, options] = webpush.sendNotification.mock.calls[0];
    expect(subscription).toEqual({ endpoint: device("1").endpoint, keys: { p256dh: "k1", auth: "a1" } });
    expect(JSON.parse(payload)).toEqual(message);
    expect(options).toMatchObject({ TTL: 86_400, vapidDetails: { subject: "https://marketlab.example", publicKey: "public", privateKey: "private" } });
  });

  it("contacts the code's home when the site isn't on https (push services refuse localhost)", async () => {
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    await sendPush(device("1"), message);
    expect(webpush.sendNotification.mock.calls[0][2].vapidDetails.subject).toMatch(/^https:\/\/github\.com\//);
  });

  it("tells a device that's gone from a passing failure", async () => {
    webpush.sendNotification.mockRejectedValueOnce(new webpush.WebPushError("gone", 410));
    expect(await sendPush(device("1"), message)).toBe("gone");
    webpush.sendNotification.mockRejectedValueOnce(new webpush.WebPushError("busy", 503));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sendPush(device("1"), message)).toBe("failed");
  });

  it("does nothing without the key pair", async () => {
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    expect(await sendPush(device("1"), message)).toBe("failed");
    expect(await sendAlertPushes(Date.now() + 1000)).toMatchObject({ sent: 0, skipped: expect.any(String) });
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });
});

describe("the daily pushes", () => {
  it("send each person's alerts to all their devices, forgetting the ones that are gone", async () => {
    db.push.due.mockResolvedValue([{ userId: "ann", alerts: [alert("a1"), alert("a2")], devices: [device("phone"), device("old")] }]);
    webpush.sendNotification.mockImplementation(async (s: { endpoint: string }) => {
      if (s.endpoint.endsWith("old")) throw new webpush.WebPushError("gone", 404);
      return { statusCode: 201 };
    });
    expect(await sendAlertPushes(Date.now() + 10_000)).toEqual({ people: 1, sent: 2, failed: 0, devicesRemoved: 1 });
    expect(db.push.remove).toHaveBeenCalledWith([device("old").endpoint]);
    expect(db.push.markSent).toHaveBeenCalledWith([device("phone").endpoint]);
    expect(db.push.markPushed).toHaveBeenCalledWith("ann", ["a1", "a2"]);
  });

  it("try again tomorrow if every device failed for now", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.push.due.mockResolvedValue([{ userId: "ann", alerts: [alert("a1")], devices: [device("phone")] }]);
    webpush.sendNotification.mockRejectedValue(new webpush.WebPushError("busy", 503));
    expect(await sendAlertPushes(Date.now() + 10_000)).toMatchObject({ sent: 0, failed: 1 });
    expect(db.push.markPushed).not.toHaveBeenCalled();
  });

  it("stop at the deadline", async () => {
    db.push.due.mockResolvedValue([{ userId: "ann", alerts: [alert("a1")], devices: [device("phone")] }]);
    expect(await sendAlertPushes(Date.now() - 1)).toMatchObject({ people: 0, sent: 0 });
  });
});
