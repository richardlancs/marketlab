import { expect, test } from "./fixtures";

test("a season: join with a fresh $100,000, trade in it, switch back, and appear in the standings", async ({ page, request }) => {
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Season Tester");
  await page.getByLabel("Email").fill(`season-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("a-long-test-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-up"));

  // "This season" goes to this month's page.
  await page.goto("/leaderboard/season");
  await expect(page).toHaveURL(/\/leaderboard\/season\/\d{4}-\d{2}$/);
  const seasonUrl = page.url();
  const name = `Racer${Date.now() % 100000}`;
  await page.getByLabel("Your display name").fill(name);
  await page.getByRole("button", { name: /^Join the .+ season$/ }).click();
  await expect(page.getByText(/You're playing as/)).toBeVisible();

  // Trading now happens in the season portfolio: $100,000 in cash, nothing held.
  await page.goto("/stocks/AAPL");
  const trade = page.locator("section[aria-labelledby=trade]");
  await expect(trade.getByRole("radio", { name: /season/ })).toHaveAttribute("aria-checked", "true");
  await trade.getByLabel("Shares").fill("10");
  await trade.getByRole("button", { name: /^Buy 10 AAPL/ }).click();
  await page.goto("/portfolio");
  const holdings = page.locator("section[aria-labelledby=portfolio]");
  await expect(holdings.getByRole("link", { name: "AAPL" })).toBeVisible();
  await expect(holdings.getByRole("link", { name: "MSFT" })).toHaveCount(0);

  // Back to practice: the starter portfolio, untouched.
  await page.getByRole("radio", { name: "Practice portfolio" }).click();
  await expect(holdings.getByRole("link", { name: "MSFT" })).toBeVisible();

  // On the standings, with a page of their own to share.
  await page.goto(seasonUrl);
  await expect(page.getByRole("region", { name: "Standings" }).getByText(name)).toBeVisible();
  await page.goto(`${seasonUrl}/${name.toLowerCase()}`);
  await expect(page.getByRole("heading", { name })).toBeVisible();
  const image = await request.get(`${seasonUrl}/${name.toLowerCase()}/opengraph-image`);
  expect(image.headers()["content-type"]).toBe("image/png");
});

test("season pages that don't exist are real 404s", async ({ request }) => {
  expect((await request.get("/leaderboard/season/2026-13")).status()).toBe(404);
  expect((await request.get("/leaderboard/season/2999-01")).status()).toBe(404);
  expect((await request.get("/leaderboard/season/nonsense/someone")).status()).toBe(404);
});
