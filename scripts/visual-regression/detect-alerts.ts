/**
 * detect-alerts.ts — Scan screenshot edges for red pill-shaped alert indicators.
 *
 * Detects clusters of "alert-red" pixels in the edge margins of screenshots —
 * the kind of floating overlays that dev tools, error indicators, and notification
 * badges render on top of the page (e.g. Next.js "1 Issue" pill, error toasts).
 *
 * Only scans the outer margin (default: 15% from each edge), ignoring the main
 * content area where red badges, dots, and UI elements are expected.
 *
 * Returns bounding boxes and pixel counts for each detected cluster,
 * so the pipeline can flag screenshots that need human inspection.
 */

import fs from "node:fs";
import { PNG } from "pngjs";

export interface AlertRegion {
	x: number;
	y: number;
	width: number;
	height: number;
	pixelCount: number;
	corner: "top-left" | "top-right" | "bottom-left" | "bottom-right";
}

export interface AlertScanResult {
	hasAlerts: boolean;
	regions: AlertRegion[];
	totalAlertPixels: number;
	imagePath: string;
}

/**
 * Returns true if a pixel is "alert red":
 *   R >= 180, G <= 80, B <= 80, A >= 200
 *
 * Catches: #EF4444, #DC2626, #B91C1C, #FF0000, and similar saturated reds.
 */
function isAlertRed(r: number, g: number, b: number, a: number): boolean {
	return r >= 180 && g <= 80 && b <= 80 && a >= 200;
}

/**
 * Returns true if a pixel coordinate falls within the edge margin zone.
 * The margin is the outer strip of the image — corners where floating
 * overlays and dev indicators typically render.
 */
function isInEdgeMargin(
	x: number,
	y: number,
	imgW: number,
	imgH: number,
	marginFraction: number,
): boolean {
	const mx = imgW * marginFraction;
	const my = imgH * marginFraction;
	const inHorizontalMargin = x < mx || x >= imgW - mx;
	const inVerticalMargin = y < my || y >= imgH - my;
	// Must be in a corner zone (both horizontal and vertical edge)
	return inHorizontalMargin && inVerticalMargin;
}

/**
 * Classify which corner a bounding box center falls in.
 */
function classifyCorner(
	cx: number,
	cy: number,
	imgW: number,
	imgH: number,
): AlertRegion["corner"] {
	const midX = imgW / 2;
	const midY = imgH / 2;
	if (cx < midX && cy < midY) return "top-left";
	if (cx >= midX && cy < midY) return "top-right";
	if (cx < midX && cy >= midY) return "bottom-left";
	return "bottom-right";
}

/**
 * Flood-fill to find connected red pixel clusters.
 */
function floodFill(
	visited: Uint8Array,
	redMask: Uint8Array,
	startIdx: number,
	width: number,
	height: number,
): { pixels: number[]; count: number } {
	const queue = [startIdx];
	const pixels: number[] = [];
	visited[startIdx] = 1;

	while (queue.length > 0) {
		const idx = queue.pop()!;
		pixels.push(idx);

		const x = idx % width;
		const y = Math.floor(idx / width);

		const neighbors = [
			y > 0 ? idx - width : -1,
			y < height - 1 ? idx + width : -1,
			x > 0 ? idx - 1 : -1,
			x < width - 1 ? idx + 1 : -1,
		];

		for (const n of neighbors) {
			if (n >= 0 && !visited[n] && redMask[n]) {
				visited[n] = 1;
				queue.push(n);
			}
		}
	}

	return { pixels, count: pixels.length };
}

/**
 * Scan a PNG image for clusters of alert-red pixels in the edge margins.
 *
 * @param imagePath       Path to the PNG file
 * @param minClusterSize  Minimum pixel count for a cluster to be reported (default: 50)
 * @param marginFraction  Fraction of image width/height to treat as edge zone (default: 0.15)
 * @returns AlertScanResult with detected regions
 */
export function scanForAlerts(
	imagePath: string,
	minClusterSize = 50,
	marginFraction = 0.15,
): AlertScanResult {
	const img = PNG.sync.read(fs.readFileSync(imagePath));
	const { width, height, data } = img;
	const totalPx = width * height;

	// Build a binary mask of alert-red pixels ONLY in edge margin corners
	const redMask = new Uint8Array(totalPx);
	for (let i = 0; i < totalPx; i++) {
		const x = i % width;
		const y = Math.floor(i / width);
		if (!isInEdgeMargin(x, y, width, height, marginFraction)) continue;

		const off = i * 4;
		if (isAlertRed(data[off], data[off + 1], data[off + 2], data[off + 3])) {
			redMask[i] = 1;
		}
	}

	// Find connected clusters via flood fill
	const visited = new Uint8Array(totalPx);
	const regions: AlertRegion[] = [];
	let totalAlertPixels = 0;

	for (let i = 0; i < totalPx; i++) {
		if (redMask[i] && !visited[i]) {
			const cluster = floodFill(visited, redMask, i, width, height);

			if (cluster.count >= minClusterSize) {
				let minX = width, maxX = 0, minY = height, maxY = 0;
				for (const px of cluster.pixels) {
					const x = px % width;
					const y = Math.floor(px / width);
					if (x < minX) minX = x;
					if (x > maxX) maxX = x;
					if (y < minY) minY = y;
					if (y > maxY) maxY = y;
				}

				const regionW = maxX - minX + 1;
				const regionH = maxY - minY + 1;
				const cx = minX + regionW / 2;
				const cy = minY + regionH / 2;

				regions.push({
					x: minX,
					y: minY,
					width: regionW,
					height: regionH,
					pixelCount: cluster.count,
					corner: classifyCorner(cx, cy, width, height),
				});

				totalAlertPixels += cluster.count;
			}
		}
	}

	return {
		hasAlerts: regions.length > 0,
		regions,
		totalAlertPixels,
		imagePath,
	};
}
