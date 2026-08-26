import { chromium } from "@playwright/test";

const BASE = "http://localhost:3077";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

await page.goto(`${BASE}/explore`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);

await page.click(".cg-nav-search");
await page.waitForTimeout(1000);
await page.keyboard.type("vermont electric coop");
await page.waitForTimeout(4000);

const utilBtn = page.locator('button', { hasText: "Vermont Electric Cooperative" }).first();
console.log("URL BEFORE CLICK:", page.url());
console.log("Button visible:", await utilBtn.isVisible().catch(() => false));
await utilBtn.click();
await page.waitForTimeout(3000);
console.log("URL AFTER CLICK:", page.url());

await browser.close();
