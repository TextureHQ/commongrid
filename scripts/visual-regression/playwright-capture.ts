/**
 * playwright-capture.ts — Navigate to routes and capture screenshots
 * with bounding box coordinates for annotation regions.
 */

import { chromium, type Browser, type BrowserContext } from "playwright";
import fs from "node:fs";
import path from "node:path";
import type { BBox } from "./annotate";

export interface ManifestViewport {
	name: string;
	width: number;
	height: number;
}

export interface ManifestRegion {
	selector: string;
	beforeColor: string;
	afterColor: string;
	label: string;
}

export interface ManifestAction {
	type: "click" | "hover" | "fill";
	selector: string;
	value?: string;
}

export interface ManifestCapture {
	id: string;
	commit?: string;
	route: string;
	description: string;
	waitFor?: string;
	viewports?: string[];
	actions?: ManifestAction[];
	regions: ManifestRegion[];
}

export interface CaptureResult {
	captureId: string;
	viewport: string;
	screenshotPath: string;
	regions: Array<{
		selector: string;
		bbox: BBox | null;
		beforeColor: string;
		afterColor: string;
		label: string;
	}>;
}

const ANIMATION_DISABLE_CSS = `
*, *::before, *::after {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
  scroll-behavior: auto !important;
}
`;

export async function captureAll(
	baseUrl: string,
	captures: ManifestCapture[],
	allViewports: ManifestViewport[],
	outputDir: string,
	label: string,
): Promise<CaptureResult[]> {
	fs.mkdirSync(outputDir, { recursive: true });

	const browser = await chromium.launch({ headless: true });
	const results: CaptureResult[] = [];

	try {
		for (const capture of captures) {
			const viewportNames = capture.viewports ?? allViewports.map((v) => v.name);
			const viewports = allViewports.filter((v) =>
				viewportNames.includes(v.name),
			);

			for (const vp of viewports) {
				const context = await browser.newContext({
					viewport: { width: vp.width, height: vp.height },
					deviceScaleFactor: 1,
					colorScheme: "light",
				});
				const page = await context.newPage();

				try {
					// Navigate — use load (not networkidle which hangs on long-poll)
					await page.goto(`${baseUrl}${capture.route}`, {
						waitUntil: "load",
						timeout: 30_000,
					});

					// Wait for specific content selector if provided
					if (capture.waitFor) {
						await page
							.waitForSelector(capture.waitFor, { timeout: 15_000 })
							.catch(() => {
								console.warn(
									`  ⚠ waitFor selector not found: ${capture.waitFor} (${capture.id}/${vp.name})`,
								);
							});
					}

					// Wait for data-driven content to render:
					// Try to detect that the page has loaded real content by waiting
					// for either a table row, a card, or a list item to appear
					await page.waitForSelector(
						'[class*="DataTable"] [role="row"], table tr, [class*="Card"], main h1',
						{ timeout: 10_000 },
					).catch(() => {
						// Fallback: just wait a fixed amount
					});

					// Final settle for any remaining renders / transitions
					await page.waitForTimeout(1500);

					// Disable animations
					await page.addStyleTag({ content: ANIMATION_DISABLE_CSS });
					await page.waitForTimeout(100);

					// Execute pre-capture actions
					if (capture.actions) {
						for (const action of capture.actions) {
							const loc = page.locator(action.selector).first();
							if (await loc.isVisible().catch(() => false)) {
								if (action.type === "click") await loc.click();
								else if (action.type === "hover") await loc.hover();
								else if (action.type === "fill" && action.value)
									await loc.fill(action.value);
								await page.waitForTimeout(300);
							}
						}
					}

					// Capture screenshot
					const filename = `${capture.id}-${vp.name}.png`;
					const screenshotPath = path.join(outputDir, filename);
					await page.screenshot({ path: screenshotPath, fullPage: false });

					// Record bounding boxes for each region
					const regionResults = [];
					for (const region of capture.regions) {
						let bbox: BBox | null = null;
						try {
							const loc = page.locator(region.selector).first();
							if (await loc.isVisible().catch(() => false)) {
								const rawBox = await loc.boundingBox();
								if (rawBox) {
									bbox = {
										x: rawBox.x,
										y: rawBox.y,
										width: rawBox.width,
										height: rawBox.height,
									};
								}
							}
						} catch {
							// selector not found — bbox stays null
						}
						regionResults.push({
							selector: region.selector,
							bbox,
							beforeColor: region.beforeColor,
							afterColor: region.afterColor,
							label: region.label,
						});
					}

					// Save region data
					const regionsPath = path.join(
						outputDir,
						`${capture.id}-${vp.name}.regions.json`,
					);
					fs.writeFileSync(regionsPath, JSON.stringify(regionResults, null, 2));

					results.push({
						captureId: capture.id,
						viewport: vp.name,
						screenshotPath,
						regions: regionResults,
					});

					console.log(`  ✓ ${label}/${capture.id}/${vp.name}`);
				} catch (err) {
					console.error(
						`  ✗ ${label}/${capture.id}/${vp.name}: ${err instanceof Error ? err.message : err}`,
					);
				} finally {
					await context.close();
				}
			}
		}
	} finally {
		await browser.close();
	}

	return results;
}
