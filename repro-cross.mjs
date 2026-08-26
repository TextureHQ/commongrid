import { chromium } from "@playwright/test";

const BASE = "http://localhost:3077";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

// Start on programs
await page.goto(`${BASE}/explore?tab=programs`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);

// Search for a utility
await page.click(".cg-nav-search");
await page.waitForTimeout(1000);
await page.keyboard.type("vermont electric coop");
await page.waitForTimeout(4000);

const utilBtn = page.locator('div[role="dialog"] button', { hasText: "Vermont Electric Cooperative" }).first();
await utilBtn.click();
await page.waitForTimeout(4000);

await page.screenshot({ path: "/tmp/cross-entity.png", fullPage: true });
console.log("URL:", page.url());

const text = await page.locator(".cg-explore-empty").textContent().catch(() => null);
console.log("Empty text:", text);

await browser.close();
