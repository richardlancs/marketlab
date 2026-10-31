import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/**
 * The account pages (app/account), the privacy policy and cookie settings:
 * changing the profile, downloading and erasing data, and deleting an
 * account, as a person would, in the production build.
 */

// A 2 × 1 PNG (one red and one blue pixel): small, but a real image the browser can decode and crop.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAADUlEQVR4nGP4zwAE/wEHAAH/4iOeWQAAAABJRU5ErkJggg==", "base64");
const PASSWORD = "a-long-test-password-123";

async function signUp(page: Page, name = "Account Tester") {
  const email = `account-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-up"));
  return email;
}

test.describe("privacy pages", () => {
  test("the policy and cookie settings are linked from every page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("navigation", { name: "Legal" }).getByRole("link", { name: "Privacy policy" }).click();
    await expect(page.getByRole("heading", { name: "Privacy policy", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "How long we keep it" })).toBeVisible();
    await page.getByRole("navigation", { name: "Legal" }).getByRole("link", { name: "Cookie settings" }).click();
    await expect(page.getByRole("heading", { name: "Cookie settings", level: 1 })).toBeVisible();
    await expect(page.getByRole("rowheader", { name: /marketlab_guest/ })).toBeVisible();
  });

  test("no cookie banner where there's nothing optional to ask about, and no analytics without a yes", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("region", { name: "Cookie choices" })).toHaveCount(0);
    expect(await page.locator('script[src*="/_vercel/"]').count()).toBe(0);
  });

  test("the analytics choice is saved and remembered", async ({ page, context }) => {
    await page.goto("/privacy/cookies");
    const off = page.getByRole("radio", { name: /Off: essential cookies only/ });
    const on = page.getByRole("radio", { name: /On: allow analytics/ });
    // Off until chosen otherwise, with nothing saved yet.
    await expect(off).toBeChecked();
    expect((await context.cookies()).some((c) => c.name === "marketlab_consent")).toBe(false);
    await on.check();
    await expect(page.getByRole("status").filter({ hasText: "Saved: analytics are on." })).toBeVisible();
    const cookie = (await context.cookies()).find((c) => c.name === "marketlab_consent");
    expect(cookie?.value).toMatch(/^v1\.analytics\.\d+$/);
    await page.reload();
    await expect(on).toBeChecked();
    await off.check();
    await expect(page.getByRole("status").filter({ hasText: "Saved: analytics are off." })).toBeVisible();
    expect((await context.cookies()).find((c) => c.name === "marketlab_consent")?.value).toMatch(/^v1\.essential\.\d+$/);
  });
});

test.describe("Better Auth's own endpoints", () => {
  test("for changing the profile, the email and deleting an account are switched off: only the checked actions can", async ({ request }) => {
    for (const path of ["/api/auth/update-user", "/api/auth/change-email", "/api/auth/delete-user"]) {
      expect((await request.post(path, { data: {} })).status(), path).toBe(404);
    }
    expect((await request.get("/api/auth/delete-user/callback?token=x")).status()).toBe(404);
  });

  test("a picture is only ever sent to its owner", async ({ request }) => {
    expect((await request.get("/api/account/avatar?v=0123456789abcdef")).status()).toBe(404);
  });
});

test.describe("your account", () => {
  test("change your name, picture and password", async ({ page }) => {
    const email = await signUp(page);
    await page.goto("/account");
    await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();

    // Name: saved, and the header's account button follows.
    await page.getByLabel("Name", { exact: true }).fill("  Renamed   Person ");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Name saved.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Account: Renamed Person" })).toBeVisible();

    // Picture: cropped in the browser, previewed, saved; then served only from this site, to its owner.
    await page.locator('input[type="file"]').setInputFiles({ name: "me.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByRole("img", { name: "Your new picture" })).toBeVisible();
    await page.getByRole("button", { name: "Save picture" }).click();
    await expect(page.getByText("Picture saved.")).toBeVisible();
    const headerPicture = page.getByRole("banner").locator('img[src^="/api/account/avatar?v="]');
    await expect(headerPicture).toBeVisible();
    const src = (await headerPicture.getAttribute("src"))!;
    const picture = await page.request.get(src);
    expect(picture.status()).toBe(200);
    expect(picture.headers()["content-type"]).toMatch(/^image\/(webp|jpeg)$/);
    expect(picture.headers()["content-security-policy"]).toContain("sandbox");
    await page.getByRole("button", { name: "Remove" }).click();
    await expect(page.getByText("Picture removed.")).toBeVisible();
    await expect(headerPicture).toHaveCount(0);
    expect((await page.request.get(src)).status()).toBe(404);

    // Password: the current one must be right (asked directly, so the refusal isn't a console error in the page)…
    const wrong = await page.request.post("/api/auth/change-password", {
      data: { currentPassword: "not-my-password", newPassword: "another-long-password-456" },
      headers: { Origin: "http://localhost:3010" },
    });
    expect(wrong.status()).toBe(400);
    // …and the two new ones must match; then it changes.
    await page.getByLabel("Current password").fill(PASSWORD);
    await page.getByLabel("New password", { exact: true }).fill("another-long-password-456");
    await page.getByLabel("New password again").fill("another-long-password-789");
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("The two new passwords don't match.")).toBeVisible();
    await page.getByLabel("New password again").fill("another-long-password-456");
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("Password changed.")).toBeVisible();
    // The new password signs in.
    const signIn = await page.request.post("/api/auth/sign-in/email", { data: { email, password: "another-long-password-456" }, headers: { Origin: "http://localhost:3010" } });
    expect(signIn.status()).toBe(200);
  });

  test("download your data, erase part of it, then delete the account", async ({ page }) => {
    const email = await signUp(page, "Leaving Soon");
    // Some data: a trade.
    await page.goto("/stocks/KO#trade");
    const trade = page.locator("section[aria-labelledby=trade]");
    await trade.getByLabel("Shares").fill("3");
    await trade.getByRole("button", { name: /^Buy 3 KO/ }).click();
    await expect(page.getByText(/3 shares/).filter({ visible: true }).first()).toBeVisible();

    await page.goto("/account/data");
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download my data" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^marketlab-data-\d{4}-\d{2}-\d{2}\.json$/);
    const exported = JSON.parse(await readFile((await file.path())!, "utf8"));
    expect(exported.profile).toMatchObject({ email, name: "Leaving Soon" });
    expect(exported.portfolio.trades.some((t: { symbol: string; shares: number }) => t.symbol === "KO" && t.shares === 3)).toBe(true);
    expect(JSON.stringify(exported)).not.toMatch(/"password"|"token"|accessToken/);

    // Erase the portfolio only: the trade goes, the account stays.
    await page.getByRole("checkbox", { name: /Practice portfolio/ }).check();
    await page.getByRole("button", { name: "Erase selected" }).click();
    await page.getByRole("button", { name: "Yes, erase it" }).click();
    await page.waitForURL(/done=erased/);
    await expect(page.getByText("Done: what you chose has been erased.")).toBeVisible();
    const after = await (await page.request.get("/api/account/export")).json();
    expect(after.portfolio.trades).toEqual([]);

    // Delete: needs the exact words and the right password.
    await page.getByLabel("Your password").fill("wrong-password-000");
    await page.getByLabel(/Type delete my account to confirm/).fill("delete my account");
    await page.getByRole("button", { name: "Delete my account" }).click();
    await expect(page.getByText("That password isn't right.")).toBeVisible();
    await page.getByLabel("Your password").fill(PASSWORD);
    await page.getByRole("button", { name: "Delete my account" }).click();
    await page.waitForURL(/done=deleted/);
    await expect(page.getByText("Your account and everything in it have been deleted.")).toBeVisible();
    await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toBeVisible();

    // It's gone: signing in no longer works. (Asked directly, so the refusal isn't a console error in the page.)
    const signIn = await page.request.post("/api/auth/sign-in/email", { data: { email, password: PASSWORD }, headers: { Origin: "http://localhost:3010" } });
    expect(signIn.status()).toBe(401);
  });

  test("a guest can download and delete what their browser saved", async ({ page, context }) => {
    await page.goto("/stocks/PEP#trade");
    const trade = page.locator("section[aria-labelledby=trade]");
    await trade.getByLabel("Shares").fill("1");
    await trade.getByRole("button", { name: /^Buy 1 PEP/ }).click();
    await expect(page.getByText(/1 share/).filter({ visible: true }).first()).toBeVisible();
    expect((await context.cookies()).some((c) => c.name === "marketlab_guest")).toBe(true);

    await page.goto("/account/data");
    const exported = await (await page.request.get("/api/account/export")).json();
    expect(exported.profile.isGuest).toBe(true);
    await page.getByRole("button", { name: "Delete guest data" }).click();
    await page.getByRole("button", { name: "Yes, delete everything" }).click();
    await page.waitForURL(/done=guest-deleted/);
    await expect(page.getByText("Done: everything this browser saved has been deleted.")).toBeVisible();
    expect((await context.cookies()).some((c) => c.name === "marketlab_guest")).toBe(false);
    expect((await page.request.get("/api/account/export")).status()).toBe(404);
  });
});
