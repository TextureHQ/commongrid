import { expect, type Page, test } from "@playwright/test";
import bas from "../data/balancing-authorities.json";
import isos from "../data/isos.json";
import plants from "../data/power-plants.json";
import programs from "../data/programs.json";
import utilities from "../data/utilities.json";

// Public snapshots through the real hooks and panels. The rate is a synthetic fixture.
const cases = [
  { entity: "utility", tab: "utilities", api: "utilities", record: utilities[0], rows: 5 },
  { entity: "program", tab: "programs", api: "programs", record: programs[0], rows: 13 },
  { entity: "power-plant", tab: "power-plants", api: "power-plants", record: plants[0], rows: 10 },
  { entity: "iso", tab: "grid-operators", api: "isos", record: isos[0], rows: 3 },
  { entity: "ba", tab: "grid-operators", api: "balancing-authorities", record: bas[0], rows: 5 },
  {
    entity: "rate",
    tab: "rates",
    api: "rates",
    rows: 12,
    record: {
      id: "test-rate",
      slug: "test-rate",
      name: "Test residential rate",
      sector: "Residential",
      fixedCharge: "10",
      fixedChargeUnits: "$/month",
      hasTou: false,
      hasDemandCharge: false,
      hasNetMetering: false,
      isEvRate: false,
    },
  },
];

async function setup(page: Page, item: (typeof cases)[number], status = 200) {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === `/api/v1/${item.api}/${item.record.slug}`) {
      await gate;
      return route.fulfill({ status, json: { data: status === 200 ? item.record : null } });
    }
    const data = path === `/api/v1/${item.api}` ? [item.record] : [];
    return route.fulfill({
      json: { data, pagination: { total: data.length, hasMore: false, cursor: null, limit: 50 } },
    });
  });
  await page.route("**/data/territories/**", (route) =>
    route.fulfill({ json: { type: "FeatureCollection", features: [] } })
  );
  await page.goto(`/explore/${item.tab}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(item.record.name, { exact: true }).first()).toBeVisible();
  await page.evaluate(() => {
    const seen: string[] = [];
    Object.assign(window, { loadingSeen: seen });
    new MutationObserver(() => {
      for (const el of document.querySelectorAll("[data-detail-skeleton], .cg-explore-empty, .cg-explore-loading")) {
        seen.push(el.getAttribute("data-detail-skeleton") ?? el.textContent ?? "");
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
  return release;
}

for (const item of cases) {
  test(`${item.entity}: delayed shape, completion, cached revisit`, async ({ page }, testInfo) => {
    const release = await setup(page, item);
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    await page.getByText(item.record.name, { exact: true }).first().click();
    const skeleton = page.locator(`[data-detail-skeleton="${item.entity}"]`);
    await page.clock.runFor(199);
    await expect(skeleton).toHaveCount(0);
    await expect(page.locator(".cg-explore-empty, .cg-explore-loading")).toHaveCount(0);
    await page.clock.runFor(1);
    await expect(skeleton).toBeVisible();
    await expect(skeleton.locator(".cg-explore-kv-row")).toHaveCount(item.rows);
    await expect(skeleton.locator(".cg-explore-detail-logo")).toHaveCount(item.entity === "iso" ? 1 : 0);
    const box = await skeleton.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.width).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0);
    await page.screenshot({ path: testInfo.outputPath(`${item.entity}-loading.png`) });
    release();
    await expect(page.locator(".cg-explore-detail-name")).toHaveText(item.record.name);
    await expect(skeleton).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`${item.entity}-loaded.png`) });
    await page.getByRole("button", { name: /^Back to/ }).click();
    await page.clock.runFor(300);
    await page.getByText(item.record.name, { exact: true }).first().click();
    await page.clock.runFor(300);
    await expect(page.locator(".cg-explore-detail-name")).toHaveText(item.record.name);
    await expect(skeleton).toHaveCount(0);
    const seen = await page.evaluate(() => (window as unknown as { loadingSeen: string[] }).loadingSeen);
    expect(seen.some((text) => /not found|Loading…/.test(text))).toBe(false);
  });

  test(`${item.entity}: fast response never flashes`, async ({ page }) => {
    const release = await setup(page, item);
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    await page.getByText(item.record.name, { exact: true }).first().click();
    release();
    await expect(page.locator(".cg-explore-detail-name")).toHaveText(item.record.name);
    await page.clock.runFor(500);
    expect(await page.evaluate(() => (window as unknown as { loadingSeen: string[] }).loadingSeen)).toEqual([]);
  });
}

test("leaving pending detail cancels skeleton", async ({ page }) => {
  const item = cases[0];
  const release = await setup(page, item);
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await page.getByText(item.record.name, { exact: true }).first().click();
  await page.getByRole("button", { name: /^Back to/ }).click();
  await page.clock.runFor(500);
  await expect(page.locator("[data-detail-skeleton]")).toHaveCount(0);
  release();
  await expect(page.getByText(item.record.name, { exact: true }).first()).toBeVisible();
});

for (const status of [404, 500]) {
  test(`resolved ${status} exits loading`, async ({ page }) => {
    const item = cases[0];
    const release = await setup(page, item, status);
    await page.getByText(item.record.name, { exact: true }).first().click();
    await expect(page.locator('[data-detail-skeleton="utility"]')).toBeVisible();
    release();
    await expect(page.getByText("Utility not found", { exact: true })).toBeVisible();
    await expect(page.locator("[data-detail-skeleton]")).toHaveCount(0);
  });
}
