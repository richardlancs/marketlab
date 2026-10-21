import { expect, test as base, type Page } from "@playwright/test";

/**
 * Every test fails on a JavaScript error or a console error in the page,
 * except React's known dev-only key warning (it never appears in a
 * production build, but is filtered just in case).
 */
export const test = base.extend<{ errors: string[] }>({
  errors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => {
        if (m.type() === "error" && !m.text().includes('unique "key"')) errors.push(m.text());
      });
      await use(errors);
      expect(errors, "errors in the page").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** A share link (`/backtest#run=…`) for these backtest settings. */
export function backtestLink(config: object): string {
  return `/backtest#run=${Buffer.from(JSON.stringify(config)).toString("base64url")}`;
}

export const lastFiveYears = () => {
  const end = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()) + 86_400_000 - 1;
  return { start: end - Math.round(5 * 365.25 * 86_400_000), end };
};

export async function waitForResults(page: Page) {
  await expect(page.locator("#run-name")).toBeVisible({ timeout: 60_000 });
}
