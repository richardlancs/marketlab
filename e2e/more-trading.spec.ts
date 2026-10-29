import { expect, test } from "./fixtures";

test("selling short, then buying back to cover", async ({ page }) => {
  await page.goto("/stocks/PEP#trade");
  const trade = page.locator('[aria-labelledby="trade"]');
  await trade.locator("label", { hasText: /^Short$/ }).click();
  await trade.getByLabel("Shares").fill("5");
  await expect(trade.getByText("Set aside while short")).toBeVisible();
  await trade.getByRole("button", { name: /^Sell short 5 PEP/ }).click();
  await expect(trade.getByText(/Sold short 5 shares of PEP/)).toBeVisible({ timeout: 30_000 });

  await trade.locator("label", { hasText: /^Buy$/ }).click();
  await expect(trade.getByText(/You're short 5 shares: buying covers them/)).toBeVisible();
  await trade.getByLabel("Shares").fill("5");
  await trade.getByRole("button", { name: /^Buy back 5 PEP/ }).click();
  await expect(trade.getByText(/Bought back 5 shares of PEP/)).toBeVisible({ timeout: 30_000 });

  await page.goto("/portfolio#activity");
  await expect(page.getByText("Sell short", { exact: true })).toBeVisible();
  await expect(page.getByText("Buy to cover", { exact: true })).toBeVisible();
});

test("a buy with a bracket places its stop-loss and take-profit, and a trailing stop protects shares", async ({ page }) => {
  await page.goto("/stocks/MCD#trade");
  const trade = page.locator('[aria-labelledby="trade"]');
  const price = Number((await page.locator('[aria-labelledby="trade"] dd').first().textContent())!.replace(/[$,]/g, ""));
  await trade.getByText("Protect it").click();
  await trade.getByLabel("Stop-loss").fill((price * 0.9).toFixed(2));
  await trade.getByLabel("Take-profit").fill((price * 1.2).toFixed(2));
  // About 4.5 times the $ distance to the stop: 4 whole shares.
  await trade.getByLabel("Risk at most ($)").fill((price * 0.1 * 4.5).toFixed(0));
  await trade.getByRole("button", { name: /^Use \d+/ }).click();
  await expect(trade.getByLabel("Shares")).toHaveValue("4");
  await trade.getByRole("button", { name: /^Buy 4 MCD/ }).click();
  await expect(trade.getByText(/Bought 4 shares of MCD .* then a stop-loss at .* and a take-profit at .* placed/)).toBeVisible({ timeout: 30_000 });

  await trade.locator("label", { hasText: /^Sell$/ }).click();
  await trade.getByLabel("Order type").selectOption("trailing");
  await trade.getByLabel("Shares").fill("2");
  // The bracket's two sell orders already cover all 4 shares.
  await expect(trade.getByText("You only have 0 MCD shares not already in a sell order.")).toBeVisible();

  await page.goto("/portfolio#orders");
  await expect(page.getByText("Stop-loss · one cancels the other")).toBeVisible();
  await expect(page.getByText("Take-profit · one cancels the other")).toBeVisible();
});

test("buying a call in the options lab puts it in the portfolio, and it can be closed", async ({ page }) => {
  test.slow();
  await page.goto("/options");
  const chain = page.getByRole("table").first();
  await expect(chain).toBeVisible({ timeout: 60_000 });
  await chain.getByRole("button", { name: /^Call at/ }).nth(8).click();
  await page.getByLabel("Contracts").fill("1");
  await page.getByRole("button", { name: /^Buy · \$/ }).click();
  await expect(page.getByText(/Bought 1 contract at/)).toBeVisible({ timeout: 60_000 });

  await page.goto("/portfolio");
  const options = page.locator('[aria-labelledby="options"]');
  await expect(options.getByRole("rowheader", { name: / call/ })).toBeVisible({ timeout: 30_000 });
  await options.getByRole("button", { name: "Close" }).click();
  await expect(options).toHaveCount(0, { timeout: 60_000 });
});
