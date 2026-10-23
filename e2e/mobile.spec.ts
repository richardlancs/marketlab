import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/**
 * The phone layout (the "phone" project in playwright.config.ts: an
 * iPhone-sized screen), in light and dark. Every main page must:
 * - pass axe's WCAG 2.2 AA checks (serious and critical problems fail);
 * - never scroll sideways;
 * - give every control a tap area of at least 24×24px (WCAG 2.2, 2.5.8),
 *   counting the invisible area the `tap` utility adds;
 * - show no text under 12px, and no form text under 16px (smaller makes
 *   iPhone Safari zoom in when a field is tapped).
 */
const PAGES = ["/", "/stocks", "/stocks/AAPL", "/screener", "/screener/history", "/watchlist", "/portfolio", "/backtest", "/leaderboard", "/leaderboard/season", "/leaderboard/seasons", "/learn", "/learn/sharpe-ratio", "/sign-in"];

interface LayoutProblems {
  overflow: boolean;
  smallTargets: string[];
  tinyText: string[];
  smallInputs: string[];
}

/** Measures the page as it is now. Runs in the browser. */
function layoutProblems(page: Page): Promise<LayoutProblems> {
  return page.evaluate(() => {
    const shown = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden" && !el.closest("[popover]:not(:popover-open), dialog:not([open]), .sr-only, [aria-hidden=true]");
    };
    const describe = (el: Element) => `${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40)}"`;
    // A link inside running text is exempt from the target size (WCAG's "inline" exception).
    const inline = (el: Element) => el.tagName === "A" && getComputedStyle(el).display === "inline" && [...el.parentElement!.childNodes].some((n) => n !== el && n.nodeType === Node.TEXT_NODE && n.textContent!.trim());
    const tapSize = (el: Element) => {
      const r = el.getBoundingClientRect();
      const after = getComputedStyle(el, "::after");
      const extra = after.content !== "none" && after.position === "absolute" ? parseFloat(after.height) || 0 : 0;
      return { w: r.width, h: Math.max(r.height, extra) };
    };
    const controls = [...document.querySelectorAll("a, button, input, select, summary, [role=button], [role=tab], [role=radio], label:has(input)")]
      .filter(shown)
      // A checkbox or radio inside a label is tapped through its label, which is measured instead.
      .filter((el) => !inline(el) && !(el.matches("input[type=checkbox], input[type=radio]") && el.closest("label")));
    const hasText = (el: Element) => [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim());
    return {
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      smallTargets: controls.filter((el) => { const { w, h } = tapSize(el); return w < 24 || h < 24; }).map(describe),
      tinyText: [...document.querySelectorAll("body *")].filter((el) => shown(el) && hasText(el) && parseFloat(getComputedStyle(el).fontSize) < 12).map(describe),
      smallInputs: [...document.querySelectorAll("input:not([type=checkbox]):not([type=radio]):not([type=range]), select, textarea")].filter((el) => shown(el) && parseFloat(getComputedStyle(el).fontSize) < 16).map(describe),
    };
  });
}

async function expectAccessible(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`)).toEqual([]);
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`on a phone, ${scheme}`, () => {
    test.use({ colorScheme: scheme });
    for (const path of PAGES) {
      test(`${path} is accessible and fits the screen`, async ({ page }) => {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        await expectAccessible(page);
        expect(await layoutProblems(page)).toEqual({ overflow: false, smallTargets: [], tinyText: [], smallInputs: [] });
      });
    }
  });
}

test.describe("phone navigation and layout", () => {
  test("the tab bar reaches every page, through More for the rest", async ({ page }) => {
    await page.goto("/");
    const tabs = page.getByRole("navigation", { name: "Main" });
    await tabs.getByRole("link", { name: "Portfolio" }).click();
    await expect(page).toHaveURL(/\/portfolio$/);
    await expect(tabs.getByRole("link", { name: "Portfolio" })).toHaveAttribute("aria-current", "page");

    await tabs.getByRole("button", { name: "More" }).click();
    const sheet = page.getByRole("dialog", { name: "More pages" });
    await sheet.getByRole("link", { name: /Backtest/ }).click();
    await expect(page).toHaveURL(/\/backtest$/);
    await expect(sheet).toBeHidden();
  });

  test("the screener's filters open in a sheet, and the results are rows", async ({ page }) => {
    await page.goto("/screener");
    await page.getByRole("button", { name: /^Filters/ }).click();
    const sheet = page.getByRole("dialog", { name: "Filters" });
    await sheet.getByRole("button", { name: "Technology" }).click();
    await sheet.getByRole("button", { name: /^Show \d+ stocks?$/ }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByRole("button", { name: "Filters (1)" })).toBeVisible();
    await page.getByLabel("Sort by").selectOption("r1Y");
    await expect(page.getByRole("region", { name: "Results" }).getByRole("listitem").first()).toContainText("1Y");
  });

  test("a backtest's results come into view when it runs, without widening the page", async ({ page }) => {
    await page.goto("/backtest");
    await page.getByRole("button", { name: "Run backtest" }).click();
    await expect(page.getByRole("heading", { name: "Results" })).toBeFocused();
    await expect(page.getByRole("heading", { name: "Results" })).toBeInViewport();
    expect((await layoutProblems(page)).overflow).toBe(false);
  });

  test("a stock page's chips jump to its sections", async ({ page }) => {
    await page.goto("/stocks/NVDA");
    const chips = page.getByRole("navigation", { name: "Sections" });
    await chips.getByRole("link", { name: "Risk" }).click();
    await expect(page.getByRole("heading", { name: "Risk", exact: true })).toBeInViewport();
    await expect(chips.getByRole("link", { name: "Risk" })).toHaveAttribute("aria-current", "location");
  });
});
