import { expect, test } from "./fixtures";

// Phase 16's Python tools, end to end: the analytics service calculates every number here.

test("the options lab prices a chain, explains an option and draws a strategy's payoff", async ({ page }) => {
  await page.goto("/options");
  const chain = page.getByRole("table");
  await expect(chain.getByRole("button").first()).toBeVisible({ timeout: 60_000 });
  await chain.getByRole("button").first().click();
  await expect(page.getByRole("region", { name: "The Greeks" }).getByText("Delta", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Strategies" }).click();
  await page.getByRole("button", { name: "Bull call spread" }).click();
  await expect(page.getByText("Most it can lose")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Breakeven", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Calculator" }).click();
  await page.getByLabel(/Market price, for implied volatility/).fill("12");
  await page.getByRole("button", { name: "Calculate" }).click();
  await expect(page.getByText("Fair value")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/would be implying a volatility of/)).toBeVisible();
});

test("a stock page and the portfolio show what drives them", async ({ page }) => {
  test.slow(); // the first visit stores every stock's prices and builds the factors
  await page.goto("/stocks/NVDA#analysis");
  await expect(page.getByRole("heading", { name: "What drives it" })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(/NVDA moves/)).toBeVisible({ timeout: 90_000 });

  await page.goto("/portfolio#risk");
  await expect(page.getByText(/Your portfolio moves/)).toBeVisible({ timeout: 90_000 });
});

test("the goal planner shows the chance of reaching a target", async ({ page }) => {
  await page.goto("/portfolio#risk");
  await page.getByRole("tab", { name: "Projection" }).click({ timeout: 60_000 });
  await page.getByLabel("Target ($, optional)").fill("250000");
  await page.getByRole("button", { name: "Plan", exact: true }).click();
  await expect(page.getByText(/Chance of reaching/)).toBeVisible({ timeout: 60_000 });
});

test("the machine-learning sandbox trains, saves and reproduces a run", async ({ page }) => {
  test.slow();
  await page.goto("/backtest#ml");
  await page.getByRole("button", { name: "Train and test" }).click();
  await expect(page.getByText("Right about the direction")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(/Trained on shuffled answers/)).toBeVisible();

  await page.locator("#ml-run-name").fill("E2E model");
  await page.getByRole("button", { name: "Save run" }).click();
  await expect(page.getByText("Saved, with the exact prices it used.")).toBeVisible({ timeout: 90_000 });
  await page.getByRole("region", { name: "Saved machine-learning runs" }).getByRole("button", { name: /^E2E model/ }).click();
  await page.getByRole("button", { name: "Reproduce from saved prices" }).click();
  await expect(page.getByText(/the same result ✓/)).toBeVisible({ timeout: 90_000 });
});
