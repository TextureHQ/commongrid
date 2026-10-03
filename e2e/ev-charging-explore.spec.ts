import { expect, test } from "@playwright/test";

// Synthetic station: exercise the UI independently of database availability.
const station = {
  id: 1,
  slug: "x-gizmo-hayward-ca",
  stationName: "X Gizmo",
  streetAddress: "1 Test Street",
  city: "Hayward",
  state: "CA",
  zip: "94541",
  latitude: 37.67,
  longitude: -122.08,
  evNetwork: "Tesla",
  statusCode: "E",
  accessCode: "public",
  evDcFastNum: 0,
  evLevel2EvseNum: 2,
  evLevel1EvseNum: 0,
  evConnectorTypes: ["J1772"],
  evPricing: null,
};

for (const width of [1440, 390]) {
  test(`EV table selection and deep link stay in Explore at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.route("**/api/v1/**", (route) => {
      const { pathname } = new URL(route.request().url());
      return route.fulfill({
        json:
          pathname === `/api/v1/ev-stations/${station.slug}`
            ? { data: station }
            : {
                data: pathname === "/api/v1/ev-stations" ? [station] : [],
                pagination: { total: 1, hasMore: false, cursor: null },
              },
      });
    });
    await page.goto("/explore/ev-charging?mode=table");
    await page.getByText(station.stationName, { exact: true }).click();
    await expect(page).toHaveURL(/\/explore\/ev-charging\/x-gizmo-hayward-ca/);
    await expect(page.locator(".cg-explore-detail-name")).toHaveText(station.stationName);
    await expect(page.getByRole("region", { name: "Explore map" })).toBeVisible();
    await expect(page.getByText("1 Test Street, Hayward, CA 94541", { exact: true })).toBeVisible();

    await page.goto(`/explore/ev-charging/${station.slug}`);
    await expect(page.locator(".cg-explore-detail-name")).toHaveText(station.stationName);
    await expect(page.getByRole("region", { name: "Explore map" })).toBeVisible();
  });
}
