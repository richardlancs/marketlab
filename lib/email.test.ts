// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

// "server-only" refuses to load outside the server build; here it's just a marker.
vi.mock("server-only", () => ({}));
const { emailEnabled, sendEmail, verificationEmail } = await import("./email");

const message = verificationEmail("ann@example.com", "Ann <b>", "https://site.example/api/auth/verify-email?token=abc&callbackURL=/email-verified");

afterEach(() => vi.unstubAllEnvs());

describe("verification emails", () => {
  it("carry the link in both versions, with the name escaped in HTML", () => {
    expect(message.text).toContain("token=abc");
    expect(message.html).toContain('href="https://site.example/api/auth/verify-email?token=abc&amp;callbackURL=/email-verified"');
    expect(message.html).toContain("Hi Ann &lt;b&gt;,");
    expect(message.html).not.toContain("<b>");
  });
});

describe("sending", () => {
  it("goes through Resend when it's set up", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "MarketLab <hi@site.example>");
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    await sendEmail(message, fetchImpl as unknown as typeof fetch);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(JSON.parse(String(init.body))).toMatchObject({ from: "MarketLab <hi@site.example>", to: ["ann@example.com"], subject: message.subject });
  });

  it("reports a refusal from the provider", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "x@site.example");
    const fetchImpl = vi.fn(async () => new Response("domain not verified", { status: 403 }));
    await expect(sendEmail(message, fetchImpl as unknown as typeof fetch)).rejects.toThrow(/403/);
  });

  it("never mails a guest's placeholder address", async () => {
    await expect(sendEmail({ ...message, to: "guest-1@guest.invalid" })).rejects.toThrow(/Guests/);
  });

  it("prints to the console in development, and refuses in production without a provider", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("NODE_ENV", "development");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await sendEmail(message);
    expect(log.mock.calls[0][0]).toContain("token=abc");
    expect(emailEnabled()).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    expect(emailEnabled()).toBe(false);
    await expect(sendEmail(message)).rejects.toThrow(/isn't set up/);
    log.mockRestore();
  });
});
