import { describe, expect, it } from "vitest";
import { alertMessages, parseSubscription, SEPARATE_UP_TO, type PushAlert } from "./push";

const keys = { p256dh: "B".padEnd(87, "x"), auth: "a".repeat(22) };
const subscription = (endpoint: string, k: object = keys) => ({ endpoint, expirationTime: null, keys: k });

describe("browser subscriptions", () => {
  it("accepts the push services browsers use", () => {
    for (const endpoint of [
      "https://fcm.googleapis.com/fcm/send/abc:123",
      "https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
      "https://web.push.apple.com/QGv1",
      "https://wns2-par02p.notify.windows.com/w/?token=BQYAAA",
    ]) {
      expect(parseSubscription(subscription(endpoint))).toEqual({ endpoint, ...keys });
    }
  });

  it("refuses anything the server shouldn't be sending requests to", () => {
    for (const endpoint of [
      "http://fcm.googleapis.com/fcm/send/abc", // not https
      "https://evil.example.com/fcm/send/abc",
      "https://fcm.googleapis.com.evil.example.com/x",
      "https://fcm.googleapis.com:8443/x", // another port
      "https://user:pw@fcm.googleapis.com/x",
      "https://169.254.169.254/latest/meta-data",
      "https://localhost/x",
      `https://fcm.googleapis.com/${"x".repeat(1000)}`,
      "not a url",
    ]) {
      expect(parseSubscription(subscription(endpoint))).toBeNull();
    }
  });

  it("needs real-looking keys", () => {
    const ok = "https://fcm.googleapis.com/fcm/send/abc";
    expect(parseSubscription(subscription(ok, { ...keys, auth: "short" }))).toBeNull();
    expect(parseSubscription(subscription(ok, { ...keys, p256dh: "not base64url!".padEnd(87, "x") }))).toBeNull();
    expect(parseSubscription(subscription(ok, {}))).toBeNull();
    expect(parseSubscription({ endpoint: ok })).toBeNull();
    expect(parseSubscription(null)).toBeNull();
  });
});

describe("alert notifications", () => {
  const alert = (symbol: string, extra: Partial<PushAlert> = {}): PushAlert => ({ id: `id-${symbol}`, symbol, direction: "above", price: 200, triggerPrice: 201.3, ...extra });

  it("says what triggered, in the app's words, linking to the stock", () => {
    expect(alertMessages([alert("AAPL"), alert("KO", { direction: "below", condition: { kind: "rsi", days: 14, level: 30 } })])).toEqual([
      { title: "AAPL closes at or above $200.00", body: "It closed at $201.30.", url: "/stocks/AAPL", tag: "id-AAPL" },
      { title: "KO RSI(14) falls below 30", body: "It closed at $201.30.", url: "/stocks/KO", tag: "id-KO" },
    ]);
  });

  it("sums up a lot at once in one notification", () => {
    const many = ["A", "B", "C", "D"].map((s) => alert(s));
    expect(alertMessages(many.slice(0, SEPARATE_UP_TO))).toHaveLength(SEPARATE_UP_TO);
    expect(alertMessages(many)).toEqual([{ title: "4 of your alerts triggered", body: "A, B, C and D, at the close.", url: "/watchlist#alerts", tag: "alerts" }]);
    const lots = ["A", "B", "C", "D", "E", "E"].map((s, i) => alert(s, { id: `${i}` }));
    expect(alertMessages(lots)[0]).toMatchObject({ title: "6 of your alerts triggered", body: "A, B, C and 2 more, at the close." });
    expect(alertMessages(["K", "K", "K", "K"].map((s, i) => alert(s, { id: `${i}` })))[0].body).toBe("K, at the close.");
  });
});
