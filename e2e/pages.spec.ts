import { expect, test } from "./fixtures";

test.describe("pages", () => {
  test("the dashboard shows markets, the featured stock and logos", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByText("S&P 500").first()).toBeVisible();
    // Visible ones only: phone-width tables hide their logos.
    await expect(page.locator('img[src*="/logos/"]:visible').first()).toBeVisible();
  });

  test("every page sends the security headers", async ({ request }) => {
    const response = await request.get("/");
    const headers = response.headers();
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["strict-transport-security"]).toContain("max-age=");
  });

  test("an unknown stock is a 404", async ({ request }) => {
    expect((await request.get("/stocks/ZZZZZ")).status()).toBe(404);
  });

  test("a stock page shows risk and technicals from the analytics service", async ({ page }) => {
    // The first profile on a fresh database stores the prices and calculates it, which can pass 30 s under a full run's load.
    test.slow();
    await page.goto("/stocks/NVDA#analysis");
    // Role queries skip React's hidden copy while a streamed section swaps in.
    const risk = page.getByRole("region", { name: "Risk", exact: true });
    await expect(risk).toBeVisible({ timeout: 90_000 });
    await expect(risk.getByText("Beta vs S&P 500")).toBeVisible();
    await expect(page.getByRole("region", { name: "Technicals", exact: true }).getByText("RSI (14)")).toBeVisible();
  });

  test("the screener filters with a preset and links to a backtest", async ({ page }) => {
    await page.goto("/screener");
    const status = page.getByRole("status").filter({ hasText: /of \d+ stocks/ });
    await expect(status).toContainText(/\d+ of \d+ stocks/);
    const all = Number((await status.textContent())!.match(/of (\d+)/)![1]);
    // A company-numbers preset switches the columns; without stored SEC numbers it simply matches nothing.
    await page.getByRole("button", { name: "Quality" }).click();
    await expect(page.getByRole("button", { name: "Company numbers" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("columnheader", { name: /ROE/ })).toBeVisible();
    await page.getByRole("button", { name: "Dividend payers" }).click();
    await expect(page.getByRole("button", { name: "Price and risk" })).toHaveAttribute("aria-pressed", "true");
    await expect(status).not.toContainText(`${all} of ${all}`);
    await page.getByRole("link", { name: /Backtest today's top/ }).click();
    await expect(page).toHaveURL(/\/backtest#run=/);
  });

  test("a screen tested over time shows its monthly picks, saves and reproduces", async ({ page }) => {
    // Stores the whole catalog's prices on a fresh database first: slow under a full run's load.
    test.slow();
    await page.goto("/screener?preset=momentum");
    await page.getByRole("link", { name: /Test this screen over time/ }).click();
    await expect(page).toHaveURL(/\/screener\/history/);
    await page.getByRole("button", { name: "Test this screen over time" }).click();
    await expect(page.getByText("These results use MarketLab's simulated market")).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText("survivorship bias", { exact: true })).toBeVisible();
    const history = page.locator("section", { has: page.getByRole("heading", { name: "Monthly selections" }) });
    const month = history.locator("details").first();
    await month.locator("summary").first().click();
    await expect(month.getByText(/using prices through/)).toBeVisible();
    await expect(month.getByRole("table", { name: /Stocks selected on/ })).toBeVisible();
    await expect(month.getByText(/qualifying stock/).first()).toBeVisible();

    await page.getByRole("button", { name: "Save run" }).click();
    await expect(page.getByRole("button", { name: "Reproduce from saved inputs" })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("region", { name: "Saved screen runs" }).getByText(/Momentum leaders, \d{4}/)).toBeVisible();
    await page.getByRole("button", { name: "Reproduce from saved inputs" }).click();
    await expect(page.getByRole("status").filter({ hasText: /every selection, trade and value is the same/ })).toBeVisible({ timeout: 60_000 });
  });

  test("a lesson's quiz marks an answer", async ({ page }) => {
    await page.goto("/learn/value-at-risk");
    await expect(page.getByRole("heading", { name: "Value at Risk", level: 1 })).toBeVisible();
    const quiz = page.locator("section", { has: page.getByRole("heading", { name: "Test yourself" }) });
    const firstChoice = quiz.locator("li button[aria-pressed]").first();
    await firstChoice.click();
    await expect(firstChoice).toHaveAttribute("aria-pressed", "true");
  });
});
