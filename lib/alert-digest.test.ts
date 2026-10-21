import { describe, expect, it } from "vitest";
import { alertDigestEmail, unsubscribeToken, unsubscribeUrl, verifyUnsubscribeToken } from "./alert-digest";

const DAY = 86_400_000;
const alerts = [
  { symbol: "KO", direction: "above" as const, price: 70, triggeredAt: Date.UTC(2026, 9, 20, 20), triggerPrice: 71.2 },
  { symbol: "NVDA", direction: "below" as const, price: 200, condition: { kind: "rsi" as const, days: 14, level: 30 }, triggeredAt: Date.UTC(2026, 9, 20, 20) + DAY, triggerPrice: 190 },
];

describe("alert digest emails", () => {
  it("list every alert with a link, and carry a working unsubscribe link and header", () => {
    const unsubscribe = unsubscribeUrl("https://site.example", "user-1", "secret");
    const email = alertDigestEmail({ to: "ann@example.com", name: "Ann <b>", alerts, siteUrl: "https://site.example", unsubscribe });
    expect(email.subject).toBe("MarketLab: 2 of your alerts triggered");
    expect(email.text).toContain("KO closes at or above $70.00: closed at $71.20");
    expect(email.text).toContain("NVDA RSI(14) falls below 30");
    expect(email.html).toContain('href="https://site.example/stocks/NVDA"');
    expect(email.html).toContain("Hi Ann &lt;b&gt;,");
    expect(email.headers?.["List-Unsubscribe"]).toBe(`<${unsubscribe}>`);
    expect(email.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("name a single alert in the subject", () => {
    expect(alertDigestEmail({ to: "a@b.c", name: "", alerts: [alerts[0]], siteUrl: "https://s.example", unsubscribe: "https://s.example/u" }).subject).toBe("MarketLab alert: KO closes at or above $70.00");
  });

  it("sign unsubscribe links per user", () => {
    const token = unsubscribeToken("user-1", "secret");
    expect(verifyUnsubscribeToken("user-1", token, "secret")).toBe(true);
    expect(verifyUnsubscribeToken("user-2", token, "secret")).toBe(false);
    expect(verifyUnsubscribeToken("user-1", token, "other-secret")).toBe(false);
    expect(verifyUnsubscribeToken("user-1", "short", "secret")).toBe(false);
  });
});
