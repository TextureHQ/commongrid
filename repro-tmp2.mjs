import { chromium } from "@playwright/test";

const BASE = "http://localhost:3077";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

await page.goto(`${BASE}/explore`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);

await page.click(".cg-nav-search");
await page.waitForTimeout(1000);

const input = page.locator("input").first();
await input.fill("vermont electric coop");
await page.waitForTimeout(4000);

const utilBtn = page.locator('div[role="dialog"] button', { hasText: "Vermont Electric Cooperative" }).first();
console.log("URL BEFORE CLICK:", page.url());
await utilBtn.click();
await page.waitForTimeout(3000);
console.log("URL AFTER CLICK:", page.url());
await page.screenshot({ path: "/tmp/repro-final.png" });

await browser.close();
