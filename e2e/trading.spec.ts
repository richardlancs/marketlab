import { expect, test } from "./fixtures";

test("a guest buys shares, sets an indicator alert, and both survive a reload", async ({ page }) => {
  await page.goto("/stocks/KO");
  const trade = page.locator("section[aria-labelledby=trade]");
  await trade.getByLabel("Shares").fill("3");
  await trade.getByRole("button", { name: /^Buy 3 KO/ }).click();
  await expect(page.getByText(/You own 3 shares|3 shares/).first()).toBeVisible();

  await page.getByRole("radio", { name: "Big move" }).click();
  await page.getByRole("button", { name: "Set alert" }).click();
  await expect(page.getByText("rises 5% or more in a day")).toBeVisible();

  await page.reload();
  await expect(page.getByText("rises 5% or more in a day")).toBeVisible();
  await page.goto("/portfolio");
  await expect(page.locator("section[aria-labelledby=portfolio]").getByRole("link", { name: "KO" })).toBeVisible();
});

test("the portfolio's risk analysis loads every view", async ({ page }) => {
  await page.goto("/portfolio");
  const card = page.locator("section[aria-labelledby=risk-analysis]");
  await expect(card.getByRole("tab", { name: "Risk" })).toBeVisible({ timeout: 60_000 });
  for (const [tab, text] of [
    ["Stress tests", "Market falls 20%"],
    ["Projection", "chance of a loss"],
    ["Optimise", "Least risk"],
  ]) {
    await card.getByRole("tab", { name: tab }).click();
    await expect(card.getByText(text).first()).toBeVisible();
  }
});

test("signing up keeps the guest's portfolio", async ({ page }) => {
  await page.goto("/stocks/JPM");
  const trade = page.locator("section[aria-labelledby=trade]");
  await trade.getByLabel("Shares").fill("2");
  await trade.getByRole("button", { name: /^Buy 2 JPM/ }).click();
  await expect(page.getByText(/2 shares/).first()).toBeVisible();

  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("E2E Tester");
  await page.getByLabel("Email").fill(`e2e-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("a-long-test-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-up"));
  await page.goto("/portfolio");
  await expect(page.locator("section[aria-labelledby=portfolio]").getByRole("link", { name: "JPM" })).toBeVisible();
});
