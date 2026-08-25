import { chromium } from "@playwright/test";

const BASE = "http://localhost:3077";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("console", (m) => {
  if (m.type() === "error") console.log("[console.error]", m.text().slice(0, 300));
});
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));

await page.goto(`${BASE}/explore`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);

// open search
await page.keyboard.press("Control+k");
await page.waitForTimeout(1500);
const input = page.locator("input[placeholder*=\"Search\"]");
console.log("input visible:", await input.isVisible().catch(() => false));
await input.fill("vermont electric coop");
await page.waitForTimeout(4000);

const rows = page.locator('div[role="dialog"] button');
console.log("buttons in dialog:", await rows.count());
const utilBtn = page.locator('div[role="dialog"] button', { hasText: "Vermont Electric Cooperative" }).first();
console.log("result present:", await utilBtn.count());
await page.screenshot({ path: "/tmp/shot-1-open.png" });

await utilBtn.click();
await page.waitForTimeout(3000);
console.log("URL after click:", page.url());
await page.screenshot({ path: "/tmp/shot-2-afterclick.png", fullPage: false });

await page.waitForTimeout(3000);
console.log("URL after settle:", page.url());
await page.screenshot({ path: "/tmp/shot-3-settled.png" });

// direct deep link
await page.goto(`${BASE}/exploreexplore?view=utilities&slug=vermont-electric-cooperative`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);
console.log("deep link URL:", page.url());
await page.screenshot({ path: "/tmp/shot-4-deeplink.png" });

await browser.close();
