import { expect, test } from "./fixtures";

test.describe("installing and notifications", () => {
  test("the app can be installed: a manifest, its icons and the service worker", async ({ request }) => {
    const manifest = await (await request.get("/manifest.webmanifest")).json();
    expect(manifest).toMatchObject({ name: "MarketLab", display: "standalone", start_url: "/" });
    for (const icon of manifest.icons) expect((await request.get(icon.src)).headers()["content-type"]).toBe("image/png");
    expect((await request.get("/apple-icon.png")).status()).toBe(200);

    const worker = await request.get("/sw.js");
    expect(worker.headers()["cache-control"]).toBe("no-cache");
    expect(await worker.text()).toContain('addEventListener("push"');
  });

  test("the alerts panel offers notifications on this device", async ({ page }) => {
    await page.goto("/watchlist");
    const panel = page.getByRole("region", { name: "Price alerts" });
    const toggle = panel.getByRole("checkbox", { name: /Get alerts on this device/ });
    await expect(toggle).toBeVisible();
    await expect(toggle).not.toBeChecked();
  });
});
