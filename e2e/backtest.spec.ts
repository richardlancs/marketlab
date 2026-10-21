import { backtestLink, expect, lastFiveYears, test, waitForResults } from "./fixtures";

const config = (strategy: object, holdings = [{ symbol: "AAPL", weight: 1 }]) => ({
  version: 2,
  holdings,
  strategy,
  ...lastFiveYears(),
  initialCash: 10_000,
  costs: { commission: 1, slippageBps: 5 },
  benchmark: "same-stocks",
});

test("a crossover runs on the Python engine, saves, reopens and reproduces identically", async ({ page }) => {
  await page.goto(backtestLink(config({ kind: "moving-average", fast: 20, slow: 100 })));
  await waitForResults(page);
  const results = page.locator('section[aria-labelledby="results"]');
  await expect(results).toContainText("Calculated by the Python engine");
  await expect(results.getByText("More measures")).toBeVisible();

  await page.locator("#run-name").fill("E2E crossover");
  await page.locator("form:has(#run-name) button").click();
  const saved = page.locator('section[aria-labelledby="saved-runs"]');
  const savedRun = saved.getByRole("button", { name: "E2E crossover", exact: true }).first();
  await expect(savedRun).toBeVisible();

  await page.reload();
  await savedRun.click();
  await expect(results).toContainText("not re-run");
  await page.getByRole("button", { name: "Reproduce from saved inputs" }).click();
  await expect(results).toContainText("the same result ✓");
});

test("momentum rotation and risk parity run", async ({ page }) => {
  const three = [
    { symbol: "NVDA", weight: 0.34 },
    { symbol: "KO", weight: 0.33 },
    { symbol: "JPM", weight: 0.33 },
  ];
  for (const strategy of [
    { kind: "momentum-rotation", top: 1, lookbackMonths: 6, absolute: true },
    { kind: "risk-parity", frequency: "monthly" },
  ]) {
    await page.goto(backtestLink(config(strategy, three)));
    await waitForResults(page);
    await expect(page.locator('section[aria-labelledby="results"]')).toContainText("turned $10,000.00 into");
  }
});

test("a two-setting sweep warns about luck, and a walk-forward test runs", async ({ page }) => {
  await page.goto(backtestLink(config({ kind: "moving-average", fast: 20, slow: 100 })));
  await waitForResults(page);
  await page.getByRole("button", { name: "+ Vary a second setting" }).click();
  await page.getByRole("button", { name: "Run sweep" }).click();
  await expect(page.getByText("deflated Sharpe ratio")).toBeVisible({ timeout: 90_000 });
  await page.getByRole("button", { name: "Run walk-forward test" }).click();
  await expect(page.getByText("Sharpe on unseen data")).toBeVisible({ timeout: 90_000 });
});

test("a rule on daily highs and volume (chandelier stop) runs on the Python engine", async ({ page }) => {
  const rules = {
    kind: "rules",
    entry: { combine: "all", conditions: [{ left: { kind: "volume" }, op: "above", right: { kind: "volume-average", days: 20 } }] },
    exit: { combine: "any", conditions: [{ left: { kind: "price" }, op: "below", right: { kind: "chandelier", days: 22, multiple: 3 } }] },
  };
  await page.goto(backtestLink(config(rules)));
  await waitForResults(page);
  const results = page.locator('section[aria-labelledby="results"]');
  await expect(results).toContainText("Calculated by the Python engine");
  await expect(results).toContainText("chandelier stop (22 days, 3× ATR)");
});
