import { expect, test } from "@playwright/test";

for (const path of ["/", "/terms"]) {
  test(`${path}: notice stays at the viewport bottom while content scrolls`, async ({ page }) => {
    await page.goto(path);
    const notice = page.getByRole("complementary", { name: "Data use notice" });
    const main = page.locator("main").first();
    await expect(notice).toBeVisible();
    const initial = await notice.boundingBox();
    const viewport = page.viewportSize();
    if (!initial || !viewport) throw new Error("Missing notice or viewport");
    expect(Math.abs(initial.y + initial.height - viewport.height)).toBeLessThanOrEqual(1);

    // Some routes already own a scroll container; preserve both layouts.
    const scroller = path === "/terms" ? page.locator(".cg-legal-page") : main;
    // Long content must scroll inside main, not spill behind the notice.
    await scroller.evaluate((element) => {
      element.scrollTop = element.scrollHeight / 2;
    });
    await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect(await notice.boundingBox()).toEqual(initial);
    await scroller.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    expect(await notice.boundingBox()).toEqual(initial);
    const mainBox = await main.boundingBox();
    if (!mainBox) throw new Error("Missing main content");
    expect(mainBox.y + mainBox.height).toBeLessThanOrEqual(initial.y + 1);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(viewport.height);

    for (const [name, href] of [
      ["Terms", "/terms"],
      ["Acceptable Use", "/acceptable-use"],
      ["Privacy", "/privacy"],
    ]) {
      const link = notice.getByRole("link", { name, exact: true });
      await expect(link).toHaveAttribute("href", href);
      await link.click({ trial: true });
    }
  });
}
