import { backtestLink, expect, lastFiveYears, test, waitForResults } from "./fixtures";

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

const fiveYears = (strategy: object, holdings: { symbol: string; weight: number }[]) => ({
  version: 2,
  holdings,
  strategy,
  ...lastFiveYears(),
  initialCash: 10_000,
  costs: { commission: 1, slippageBps: 5 },
  benchmark: "same-stocks",
});

test("a backtest is checked against random versions of itself", async ({ page }) => {
  await page.goto(backtestLink(fiveYears({ kind: "moving-average", fast: 20, slow: 100 }, [{ symbol: "AAPL", weight: 1 }])));
  await waitForResults(page);
  await page.getByRole("button", { name: "Was it luck?" }).click();
  const luck = page.locator('section[aria-labelledby="luck-heading"]');
  await expect(luck.getByText(/It beat \d+% of 1,000 random timings/)).toBeVisible({ timeout: 60_000 });
  await expect(luck.getByText(/could plausibly have been anywhere from/)).toBeVisible();
  await expect(luck.getByRole("img", { name: /Histogram of 1000 random versions/ })).toBeVisible();
});

test("optimised weights run next to equal weights", async ({ page }) => {
  const three = [
    { symbol: "NVDA", weight: 0.34 },
    { symbol: "KO", weight: 0.33 },
    { symbol: "JPM", weight: 0.33 },
  ];
  await page.goto(backtestLink(fiveYears({ kind: "optimised", objective: "min-variance", frequency: "monthly", lookbackMonths: 12 }, three)));
  await waitForResults(page);
  const results = page.locator('section[aria-labelledby="results"]');
  await expect(results).toContainText("Re-optimised for the least risk every month");
  await expect(results).toContainText("The same stocks at equal weights, rebalanced as often, made");
});

test("the pairs lab scans for pairs and tests one", async ({ page }) => {
  test.slow(); // a scan reads every stock's stored prices
  await page.goto("/backtest#pairs");
  await page.getByRole("button", { name: "Find pairs" }).click();
  await expect(page.getByText(/same-sector pairs tested/)).toBeVisible({ timeout: 90_000 });
  await page.getByRole("button", { name: /^Test / }).first().click();
  await expect(page.getByText("Time in a trade")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("img", { name: /z-score each day/ })).toBeVisible();
});

test("the portfolio and the watchlist show how many independent bets they hold", async ({ page }) => {
  await page.goto("/portfolio#risk");
  await expect(page.getByText(/independent bets?/).first()).toBeVisible({ timeout: 90_000 });
  await page.goto("/watchlist#together");
  await expect(page.getByText(/independent bets?|Watch two or more stocks/).first()).toBeVisible({ timeout: 60_000 });
});
