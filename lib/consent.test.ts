import { describe, expect, it } from "vitest";
import { analyticsAllowed, CONSENT_DAYS, cookieValue, parseConsent, serializeConsent, shouldAsk } from "./consent";

const DAY = 86_400_000;
const now = 1_800_000_000_000;

describe("consent cookie", () => {
  it("round-trips a choice", () => {
    for (const analytics of [true, false]) expect(parseConsent(serializeConsent({ analytics, at: now }), now)).toEqual({ analytics, at: now });
  });
  it("forgets a choice from an older version, a malformed one, or one past its lifetime", () => {
    expect(parseConsent(`v0.analytics.${now}`, now)).toBeNull();
    expect(parseConsent("v1.yes.1", now)).toBeNull();
    expect(parseConsent("", now)).toBeNull();
    expect(parseConsent(null, now)).toBeNull();
    expect(parseConsent(serializeConsent({ analytics: true, at: now - (CONSENT_DAYS + 1) * DAY }), now)).toBeNull();
    expect(parseConsent(serializeConsent({ analytics: true, at: now + 2 * DAY }), now)).toBeNull();
  });
  it("reads one cookie among others", () => {
    expect(cookieValue("a=1; marketlab_consent=v1.essential.5; b=2", "marketlab_consent")).toBe("v1.essential.5");
    expect(cookieValue("a=1", "marketlab_consent")).toBeNull();
    expect(cookieValue("marketlab_consent=%E0%A4%A", "marketlab_consent")).toBeNull();
  });
});

describe("analytics", () => {
  it("runs only after a yes", () => {
    expect(analyticsAllowed(null)).toBe(false);
    expect(analyticsAllowed({ analytics: false, at: now })).toBe(false);
    expect(analyticsAllowed({ analytics: true, at: now })).toBe(true);
  });
  it("is asked about only where it exists, once, and not when the browser already said no", () => {
    expect(shouldAsk({ available: true, consent: null, gpc: false })).toBe(true);
    expect(shouldAsk({ available: false, consent: null, gpc: false })).toBe(false);
    expect(shouldAsk({ available: true, consent: { analytics: false, at: now }, gpc: false })).toBe(false);
    expect(shouldAsk({ available: true, consent: null, gpc: true })).toBe(false);
  });
});
